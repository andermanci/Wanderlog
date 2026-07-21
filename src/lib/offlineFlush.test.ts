import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { flushOutbox, enqueue, readOutbox, type OutboxOp } from './offline'

// Mock del cliente Supabase: registra a qué tabla y con qué datos va cada
// operación de la cola, y permite simular un corte de red.
const mock = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; values: unknown; id?: string }[],
  error: null as unknown,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (values: unknown) => {
        mock.calls.push({ table, op: 'insert', values })
        return Promise.resolve({ error: mock.error })
      },
      update: (values: unknown) => ({
        eq: (_col: string, id: string) => {
          mock.calls.push({ table, op: 'update', values, id })
          return Promise.resolve({ error: mock.error })
        },
      }),
    }),
  },
}))

const qc = { invalidateQueries: vi.fn() } as unknown as QueryClient

const doneOp = (activityId: string, done: boolean): OutboxOp => ({
  id: crypto.randomUUID(),
  kind: 'activity.done',
  payload: { activity_id: activityId, trip_id: 't1', done },
})

const packingOp = (itemId: string, is_checked: boolean): OutboxOp => ({
  id: crypto.randomUUID(),
  kind: 'packing.toggle',
  payload: { item_id: itemId, trip_id: 't1', is_checked },
})

beforeEach(() => {
  localStorage.clear()
  mock.calls.length = 0
  mock.error = null
  vi.clearAllMocks()
})

describe('flushOutbox', () => {
  it('sube una actividad marcada como hecha a la tabla correcta', async () => {
    enqueue(doneOp('a1', true))

    const n = await flushOutbox(qc)

    expect(n).toBe(1)
    expect(mock.calls).toEqual([
      { table: 'activities', op: 'update', values: { done: true }, id: 'a1' },
    ])
    expect(readOutbox()).toHaveLength(0)
  })

  it('sube una prenda marcada del equipaje a la tabla correcta', async () => {
    enqueue(packingOp('i1', true))

    await flushOutbox(qc)

    expect(mock.calls).toEqual([
      { table: 'packing_items', op: 'update', values: { is_checked: true }, id: 'i1' },
    ])
    expect(readOutbox()).toHaveLength(0)
  })

  it('si sigue sin haber red, la operación se queda en la cola para el próximo intento', async () => {
    enqueue(doneOp('a1', true))
    mock.error = { message: 'Failed to fetch' }

    const n = await flushOutbox(qc)

    expect(n).toBe(0)
    expect(readOutbox()).toHaveLength(1)
  })

  it('un error de permiso NO bloquea la cola: se descarta y siguen los demás', async () => {
    // Sin esto, un cambio irrecuperable (p. ej. te han quitado el acceso al
    // viaje) dejaría atascado para siempre todo lo que hubiera detrás.
    enqueue(doneOp('a1', true))
    mock.error = { message: 'violates row-level security policy' }

    const n = await flushOutbox(qc)

    expect(n).toBe(1)
    expect(readOutbox()).toHaveLength(0)
  })

  it('vacía una cola mixta y refresca una query por cada tipo tocado', async () => {
    enqueue(doneOp('a1', true))
    enqueue(packingOp('i1', false))

    await flushOutbox(qc)

    expect(mock.calls.map(c => c.table)).toEqual(['activities', 'packing_items'])
    // Actividades y equipaje viven en queries distintas: ambas se invalidan.
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(2)
    expect(readOutbox()).toHaveLength(0)
  })
})
