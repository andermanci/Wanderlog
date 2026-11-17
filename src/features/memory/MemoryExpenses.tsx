import { formatCurrency, sumByCurrency } from '@/lib/utils'
import type { Expense } from '@/types/database'

/** «Lo que costó la aventura»: el total por divisa y en qué categorías se fue. */
export function MemoryExpenses({ expenses }: { expenses: Expense[] }) {
  const totals = Object.entries(sumByCurrency(expenses))
  if (totals.length === 0) return null

  const byCategory = new Map<string, Expense[]>()
  for (const e of expenses) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e])
  const money = (items: Expense[]) =>
    Object.entries(sumByCurrency(items)).map(([c, v]) => formatCurrency(v, c)).join(' · ')

  return (
    <section className="break-inside-avoid rounded-3xl bg-sunken p-6 md:p-8 print:border print:border-border">
      <p className="eyebrow">Las cuentas</p>
      <h3 className="title-section mt-1">Lo que costó la aventura</h3>
      <p className="title-page mt-3 tabular-nums">{totals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        En {expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}.
      </p>
      <dl className="mt-5 grid gap-x-8 gap-y-2 border-t border-border pt-4 sm:grid-cols-2">
        {[...byCategory.entries()].map(([category, items]) => (
          <div key={category} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
            <dt className="text-muted-foreground">{category}</dt>
            <dd className="font-medium tabular-nums">{money(items)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
