import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { expenseKeys } from '@/lib/queries/expenses'
import { itineraryKeys } from '@/lib/queries/itinerary'
import type { Expense } from '@/types/database'

// ============================================================
// Cola offline ("outbox"): cambios hechos sin conexión que se
// guardan en localStorage y se suben al recuperar internet.
// Soportado: crear gastos y editar el texto del diario.
// ============================================================

const KEY = 'wanderlog-outbox'

export type OutboxOp =
  | { id: string; kind: 'expense.create'; payload: Expense }
  | { id: string; kind: 'journal.update'; payload: { day_id: string; trip_id: string; journal: string } }

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

export function enqueue(op: OutboxOp) {
  const ops = readOutbox()
  // El diario es last-write-wins: una sola entrada por día en la cola.
  const filtered = op.kind === 'journal.update'
    ? ops.filter(o => !(o.kind === 'journal.update' && o.payload.day_id === op.payload.day_id))
    : ops
  writeOutbox([...filtered, op])
}

// Detecta fallos de red (fetch rechazado) frente a errores del servidor.
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(msg)
}

async function run(op: OutboxOp): Promise<boolean> {
  if (op.kind === 'expense.create') {
    const { error } = await supabase.from('expenses').insert(op.payload)
    // 23505 = ya existía (reintento duplicado): lo damos por subido.
    if (error && error.code !== '23505') {
      if (isNetworkError(error)) return false
      console.error('[offline] expense.create falló definitivamente:', error)
      return true // error de datos/permiso: no reintentar para no bloquear la cola
    }
    return true
  }
  if (op.kind === 'journal.update') {
    const { error } = await supabase
      .from('itinerary_days')
      .update({ journal: op.payload.journal })
      .eq('id', op.payload.day_id)
    if (error) {
      if (isNetworkError(error)) return false
      console.error('[offline] journal.update falló definitivamente:', error)
      return true
    }
    return true
  }
  return true
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
        done = !isNetworkError(e)
        if (done) console.error('[offline] operación descartada:', e)
      }
      if (done) {
        synced++
        const tripId = op.kind === 'expense.create' ? op.payload.trip_id : op.payload.trip_id
        touchedTrips.add(`${op.kind}:${tripId}`)
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
    const [kind, tripId] = key.split(':')
    if (kind === 'expense.create') qc.invalidateQueries({ queryKey: expenseKeys.all(tripId) })
    else qc.invalidateQueries({ queryKey: itineraryKeys.days(tripId) })
  }
  return synced
}

export function outboxCount(): number {
  return readOutbox().length
}
