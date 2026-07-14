import { describe, it, expect } from 'vitest'
import { computeBalances, settleBalances } from './split'
import type { Expense, Traveler } from '@/types/database'

const traveler = (id: string, name: string): Traveler => ({
  id, name, trip_id: 't', is_self: false, created_at: '',
})

const expense = (e: Partial<Expense>): Expense => ({
  id: crypto.randomUUID(),
  trip_id: 't',
  description: 'x',
  category: 'Comida',
  amount: 0,
  currency: 'EUR',
  date: '2026-01-01',
  created_at: '',
  external_id: null,
  source: 'manual',
  activity_id: null,
  paid_by: null,
  split_between: [],
  ...e,
})

const ana = traveler('a', 'Ana')
const bea = traveler('b', 'Bea')
const caro = traveler('c', 'Caro')

describe('computeBalances', () => {
  it('reparte un gasto a partes iguales entre los marcados', () => {
    const balances = computeBalances(
      [expense({ amount: 30, paid_by: 'a', split_between: ['a', 'b', 'c'] })],
      [ana, bea, caro], 'EUR', undefined,
    )
    expect(balances).toEqual([
      { travelerId: 'a', paid: 30, owes: 10, net: 20 },
      { travelerId: 'b', paid: 0, owes: 10, net: -10 },
      { travelerId: 'c', paid: 0, owes: 10, net: -10 },
    ])
  })

  it('ignora los gastos sin split_between (personales)', () => {
    const balances = computeBalances(
      [expense({ amount: 50, paid_by: 'a', split_between: [] })],
      [ana, bea], 'EUR', undefined,
    )
    expect(balances).toEqual([])
  })

  it('convierte a la divisa base antes de repartir', () => {
    // 3.000 JPY con 150 JPY por EUR = 20 EUR, a repartir entre dos.
    const balances = computeBalances(
      [expense({ amount: 3000, currency: 'JPY', paid_by: 'a', split_between: ['a', 'b'] })],
      [ana, bea], 'EUR', { JPY: 150 },
    )
    expect(balances[0]).toEqual({ travelerId: 'a', paid: 20, owes: 10, net: 10 })
    expect(balances[1]).toEqual({ travelerId: 'b', paid: 0, owes: 10, net: -10 })
  })

  it('deja el importe tal cual si falta el tipo de cambio', () => {
    const balances = computeBalances(
      [expense({ amount: 10, currency: 'XXX', paid_by: 'a', split_between: ['a', 'b'] })],
      [ana, bea], 'EUR', {},
    )
    expect(balances[0].paid).toBe(10)
  })

  it('cuenta lo pagado aunque quien paga no participe en el reparto', () => {
    const balances = computeBalances(
      [expense({ amount: 20, paid_by: 'a', split_between: ['b', 'c'] })],
      [ana, bea, caro], 'EUR', undefined,
    )
    expect(balances.find(b => b.travelerId === 'a')).toEqual({ travelerId: 'a', paid: 20, owes: 0, net: 20 })
  })
})

describe('settleBalances', () => {
  it('salda con el mínimo de pagos', () => {
    const balances = computeBalances(
      [expense({ amount: 30, paid_by: 'a', split_between: ['a', 'b', 'c'] })],
      [ana, bea, caro], 'EUR', undefined,
    )
    const settlements = settleBalances(balances)
    expect(settlements).toHaveLength(2)
    expect(settlements).toContainEqual({ from: 'b', to: 'a', amount: 10 })
    expect(settlements).toContainEqual({ from: 'c', to: 'a', amount: 10 })
  })

  it('no propone pagos cuando todos están en paz', () => {
    const balances = computeBalances(
      [
        expense({ amount: 20, paid_by: 'a', split_between: ['a', 'b'] }),
        expense({ amount: 20, paid_by: 'b', split_between: ['a', 'b'] }),
      ],
      [ana, bea], 'EUR', undefined,
    )
    expect(settleBalances(balances)).toEqual([])
  })

  it('el total pagado cuadra con el total de las deudas', () => {
    const balances = computeBalances(
      [
        expense({ amount: 60, paid_by: 'a', split_between: ['a', 'b', 'c'] }),
        expense({ amount: 30, paid_by: 'b', split_between: ['b', 'c'] }),
      ],
      [ana, bea, caro], 'EUR', undefined,
    )
    const settlements = settleBalances(balances)
    const moved = settlements.reduce((s, x) => s + x.amount, 0)
    const owedTotal = balances.filter(b => b.net < 0).reduce((s, b) => s - b.net, 0)
    expect(moved).toBeCloseTo(owedTotal, 6)
  })
})
