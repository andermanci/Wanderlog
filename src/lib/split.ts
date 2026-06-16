import type { Expense, Traveler } from '@/types/database'

function convertOne(amount: number, currency: string, base: string, rates: Record<string, number> | undefined): number {
  if (currency === base) return amount
  const r = rates?.[currency]
  return r && r > 0 ? amount / r : amount // sin tipo de cambio: usa el importe tal cual
}

export interface Balance {
  travelerId: string
  paid: number   // lo que ha puesto
  owes: number   // su parte de lo compartido
  net: number    // paid - owes (>0 le deben, <0 debe)
}

export interface Settlement { from: string; to: string; amount: number }

// Balance por viajero a partir de los gastos COMPARTIDOS (split_between no vacío),
// convertidos a la divisa base. Cada gasto compartido se divide a partes iguales.
export function computeBalances(
  expenses: Expense[],
  travelers: Traveler[],
  base: string,
  rates: Record<string, number> | undefined,
): Balance[] {
  const paid = new Map<string, number>()
  const owes = new Map<string, number>()
  for (const e of expenses) {
    const split = e.split_between ?? []
    if (!split.length) continue
    const amt = convertOne(e.amount, e.currency, base, rates)
    const share = amt / split.length
    for (const t of split) owes.set(t, (owes.get(t) ?? 0) + share)
    if (e.paid_by) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + amt)
  }
  return travelers
    .map(t => {
      const p = paid.get(t.id) ?? 0
      const o = owes.get(t.id) ?? 0
      return { travelerId: t.id, paid: p, owes: o, net: p - o }
    })
    .filter(b => b.paid || b.owes)
}

// Liquidación sugerida (greedy): empareja quien debe con quien tiene saldo a favor
// hasta saldar, con el mínimo de pagos.
export function settleBalances(balances: Balance[]): Settlement[] {
  const debtors = balances.filter(b => b.net < -0.01).map(b => ({ id: b.travelerId, v: -b.net })).sort((a, b) => b.v - a.v)
  const creditors = balances.filter(b => b.net > 0.01).map(b => ({ id: b.travelerId, v: b.net })).sort((a, b) => b.v - a.v)
  const out: Settlement[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v)
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay })
    debtors[i].v -= pay
    creditors[j].v -= pay
    if (debtors[i].v < 0.01) i++
    if (creditors[j].v < 0.01) j++
  }
  return out
}
