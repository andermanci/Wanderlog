import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { expenseKeys } from '@/lib/queries/expenses'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { packingKeys } from '@/lib/queries/packing'
import type { Expense } from '@/types/database'

// ============================================================
// Cola offline ("outbox"): cambios hechos sin conexión que se
// guardan en localStorage y se suben al recuperar internet.
// Soportado: crear gastos, editar el texto del diario, marcar una
// actividad como hecha y marcar una prenda del equipaje.
// ============================================================

const KEY = 'wanderlog-outbox'

export type OutboxOp =
  | { id: string; kind: 'expense.create'; payload: Expense }
  | { id: string; kind: 'journal.update'; payload: { day_id: string; trip_id: string; journal: string } }
  | { id: string; kind: 'activity.done'; payload: { activity_id: string; trip_id: string; done: boolean } }
  | { id: string; kind: 'packing.toggle'; payload: { item_id: string; trip_id: string; is_checked: boolean } }

export function readOutbox(): OutboxOp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as OutboxOp[]
  } catch {
    return []
  }
}

function writeOutbox(ops: OutboxOp[]) {
  localStorage.setItem(KEY, JSON.stringify(ops))
}

/**
 * Identidad de la entidad que toca la operación, para las que son
 * last-write-wins: solo la última entrada de esa entidad tiene que subirse.
 * Sin esto, marcar y desmarcar una casilla diez veces sin cobertura encolaba
 * diez peticiones de las que nueve sobran (y podían aplicarse desordenadas).
 * `null` = operación acumulativa, cada una vale por sí misma (altas de gasto).
 */
function collapseKey(op: OutboxOp): string | null {
  switch (op.kind) {
    case 'journal.update': return `journal:${op.payload.day_id}`
    case 'activity.done': return `activity:${op.payload.activity_id}`
    case 'packing.toggle': return `packing:${op.payload.item_id}`
    case 'expense.create': return null
  }
}

export function enqueue(op: OutboxOp) {
  const key = collapseKey(op)
  const ops = key === null
    ? readOutbox()
    : readOutbox().filter(o => collapseKey(o) !== key)
  writeOutbox([...ops, op])
}

/**
 * Cancela una operación que aún no se ha subido. Sin esto, borrar un gasto
 * creado sin conexión lo eliminaba de la pantalla pero dejaba el alta en la
 * cola: al reconectar, el gasto resucitaba.
 * Devuelve true si había algo pendiente con ese id.
 */
export function dequeue(id: string): boolean {
  const ops = readOutbox()
  const remaining = ops.filter(o => o.id !== id)
  if (remaining.length === ops.length) return false
  writeOutbox(remaining)
  return true
}

// Detecta fallos de red (fetch rechazado) frente a errores del servidor.
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(msg)
}

// El token había caducado mientras estábamos sin conexión y todavía no se ha
// renovado. No es culpa de la operación: se reintenta cuando haya token bueno.
function isExpiredTokenError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const { code, message } = e as { code?: string; message?: string }
  // PGRST301 = PostgREST rechaza el JWT (caducado o inválido).
  return code === 'PGRST301' || /jwt expired/i.test(message ?? '')
}

// Clasifica el resultado de una operación: true = sacar de la cola, false =
// reintentar más tarde. Solo los fallos de red se reintentan; un error de datos
// o de permiso se descarta con un log para no dejar la cola atascada para siempre.
function settle(kind: OutboxOp['kind'], error: unknown): boolean {
  if (!error) return true
  if (isNetworkError(error) || isExpiredTokenError(error)) return false
  console.error(`[offline] ${kind} falló definitivamente:`, error)
  return true
}

async function run(op: OutboxOp): Promise<boolean> {
  switch (op.kind) {
    case 'expense.create': {
      const { error } = await supabase.from('expenses').insert(op.payload)
      // 23505 = ya existía (reintento duplicado): lo damos por subido.
      return settle(op.kind, error?.code === '23505' ? null : error)
    }
    case 'journal.update': {
      const { error } = await supabase
        .from('itinerary_days')
        .update({ journal: op.payload.journal })
        .eq('id', op.payload.day_id)
      return settle(op.kind, error)
    }
    case 'activity.done': {
      const { error } = await supabase.rpc('set_activity_done', {
        p_activity_id: op.payload.activity_id,
        p_done: op.payload.done,
      })
      return settle(op.kind, error)
    }
    case 'packing.toggle': {
      const { error } = await supabase
        .from('packing_items')
        .update({ is_checked: op.payload.is_checked })
        .eq('id', op.payload.item_id)
      return settle(op.kind, error)
    }
  }
}

let flushing = false

// Sube los cambios pendientes. Devuelve cuántos se sincronizaron.
export async function flushOutbox(qc: QueryClient): Promise<number> {
  if (flushing) return 0
  const ops = readOutbox()
  if (!ops.length) return 0
  flushing = true
  let synced = 0
  const remaining: OutboxOp[] = []
  const touchedTrips = new Set<string>()

  try {
    for (const op of ops) {
      let done = false
      try {
        done = await run(op)
      } catch (e) {
        done = !isNetworkError(e) && !isExpiredTokenError(e)
        if (done) console.error('[offline] operación descartada:', e)
      }
      if (done) {
        synced++
        touchedTrips.add(`${op.kind}:${op.payload.trip_id}`)
      } else {
        remaining.push(op)
      }
    }
  } finally {
    writeOutbox(remaining)
    flushing = false
  }

  // Refresca las queries afectadas con la verdad del servidor.
  for (const key of touchedTrips) {
    const sep = key.indexOf(':')
    const kind = key.slice(0, sep) as OutboxOp['kind']
    qc.invalidateQueries({ queryKey: queryKeyFor(kind, key.slice(sep + 1)) })
  }
  return synced
}

// Query que deja de ser válida cuando una operación llega al servidor.
function queryKeyFor(kind: OutboxOp['kind'], tripId: string): readonly unknown[] {
  switch (kind) {
    case 'expense.create': return expenseKeys.all(tripId)
    case 'journal.update': return itineraryKeys.days(tripId)
    case 'activity.done': return itineraryKeys.activities(tripId)
    case 'packing.toggle': return packingKeys.all(tripId)
  }
}

export function outboxCount(): number {
  return readOutbox().length
}
