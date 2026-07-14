import { describe, it, expect, beforeEach } from 'vitest'
import { readOutbox, enqueue, dequeue, outboxCount, isNetworkError, type OutboxOp } from './offline'
import type { Expense } from '@/types/database'

const expenseOp = (id: string): OutboxOp => ({
  id,
  kind: 'expense.create',
  payload: { id, trip_id: 't', amount: 10, currency: 'EUR' } as Expense,
})

const journalOp = (dayId: string, journal: string): OutboxOp => ({
  id: crypto.randomUUID(),
  kind: 'journal.update',
  payload: { day_id: dayId, trip_id: 't', journal },
})

beforeEach(() => localStorage.clear())

describe('outbox', () => {
  it('encola y cuenta las operaciones pendientes', () => {
    enqueue(expenseOp('e1'))
    enqueue(expenseOp('e2'))
    expect(outboxCount()).toBe(2)
    expect(readOutbox().map(o => o.id)).toEqual(['e1', 'e2'])
  })

  it('el diario es last-write-wins: una sola entrada por día', () => {
    enqueue(journalOp('d1', 'primera'))
    enqueue(journalOp('d1', 'segunda'))
    enqueue(journalOp('d2', 'otro día'))

    // La entrada vieja de d1 se descarta y la nueva se añade al final, así que
    // d1 (reencolado) queda antes que d2.
    const ops = readOutbox()
    expect(ops).toHaveLength(2)
    expect(ops[0].payload).toMatchObject({ day_id: 'd1', journal: 'segunda' })
    expect(ops[1].payload).toMatchObject({ day_id: 'd2' })
  })

  it('dequeue cancela un alta que aún no se ha subido', () => {
    // Es el bug que hacía resucitar un gasto: se borraba de la pantalla, pero el
    // alta seguía en la cola y volvía a subirse al recuperar la conexión.
    enqueue(expenseOp('e1'))
    enqueue(expenseOp('e2'))

    expect(dequeue('e1')).toBe(true)
    expect(readOutbox().map(o => o.id)).toEqual(['e2'])
  })

  it('dequeue devuelve false si el gasto ya se había subido', () => {
    // Un gasto que ya está en el servidor no está en la cola: hay que borrarlo
    // de verdad contra la base de datos, no limitarse a sacarlo de aquí.
    enqueue(expenseOp('e1'))
    expect(dequeue('otro')).toBe(false)
    expect(outboxCount()).toBe(1)
  })

  it('sobrevive a un localStorage corrupto', () => {
    localStorage.setItem('wanderlog-outbox', '{no es json')
    expect(readOutbox()).toEqual([])
  })
})

describe('isNetworkError', () => {
  it('reconoce los fallos de red (se reintentan)', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch' })).toBe(true)
  })

  it('no confunde un error de datos con uno de red (no se reintenta)', () => {
    expect(isNetworkError({ message: 'duplicate key value', code: '23505' })).toBe(false)
    expect(isNetworkError(new Error('violates row-level security policy'))).toBe(false)
  })
})
