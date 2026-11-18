import { categoryLook } from '@/features/money/categories'
import { formatCurrency, sumByCurrency } from '@/lib/utils'
import type { Expense } from '@/types/database'

/** «Lo que costó la aventura»: el total por divisa, en grande, y en qué categorías se fue, como una cuenta. */
export function MemoryExpenses({ expenses }: { expenses: Expense[] }) {
  const totals = Object.entries(sumByCurrency(expenses))
  if (totals.length === 0) return null

  const byCategory = new Map<string, Expense[]>()
  for (const e of expenses) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e])
  const money = (items: Expense[]) =>
    Object.entries(sumByCurrency(items)).map(([c, v]) => formatCurrency(v, c)).join(' · ')

  return (
    <section className="break-inside-avoid">
      <header className="border-b-2 border-foreground/80 pb-3">
        <p className="eyebrow">Las cuentas</p>
        <h3 className="title-page">Lo que costó la aventura</h3>
      </header>
      <p className="mt-5 font-serif text-4xl font-medium leading-tight tracking-tight tabular-nums md:text-5xl print:text-3xl">
        {totals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        En {expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}.
      </p>
      <dl className="mt-5 gap-x-12 sm:columns-2">
        {[...byCategory.entries()].map(([category, items]) => (
          <div
            key={category}
            data-tone={categoryLook(category).tone}
            className="flex break-inside-avoid items-baseline gap-2.5 border-b border-border py-2 text-[0.9375rem]"
          >
            <span aria-hidden="true" className="size-2.5 shrink-0 self-center rounded-full bg-tone" />
            <dt className="min-w-0 flex-1 text-muted-foreground">{category}</dt>
            <dd className="font-serif text-lg font-medium tracking-tight tabular-nums">{money(items)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
