import { CloudOff, Landmark, Pencil, Receipt, Trash2 } from 'lucide-react'
import { Empty, Menu } from '@/design'
import type { PendingExpense } from '@/lib/queries/expenses'
import { sumConverted } from '@/lib/queries/rates'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Traveler } from '@/types/database'
import { categoryLook } from './categories'

interface ExpenseListProps {
  expenses: PendingExpense[]
  travelers: Traveler[]
  /** Divisa principal, para el total de cada día. */
  currency: string
  rates: Record<string, number> | undefined
  canEdit: boolean
  onEdit: (expense: PendingExpense) => void
  onDelete: (expense: PendingExpense) => void
}

/**
 * Vista «Lista»: un libro de cuentas. Cada día es una página con su fecha fija
 * arriba y el total a la derecha; cada gasto, un apunte en una línea.
 */
export function ExpenseList({ expenses, travelers, currency, rates, canEdit, onEdit, onDelete }: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <Empty
        icon={Receipt}
        title="Aún no hay gastos"
        description={canEdit
          ? 'Apunta el primero arriba: pon el importe, en qué fue y pulsa «Añadir».'
          : 'Cuando alguien del viaje apunte un gasto, lo verás aquí.'}
      />
    )
  }

  const byDate = new Map<string, PendingExpense[]>()
  for (const e of expenses) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
  const nameOf = (id: string | null) => travelers.find(t => t.id === id)?.name

  return (
    <div className="space-y-6">
      {dates.map(date => {
        const items = byDate.get(date)!
        const { total, missing } = sumConverted(items, currency, rates)
        return (
          <section key={date}>
            {/* La fecha se queda pegada arriba mientras se recorren sus apuntes. */}
            <header className="sticky top-0 z-10 -mx-4 flex items-end justify-between gap-3 bg-background px-4 pb-2 pt-3 md:-mx-8 md:px-8">
              <div className="min-w-0">
                <p className="eyebrow first-letter:uppercase">{formatDate(date, 'EEEE')}</p>
                <h3 className="font-serif text-xl font-medium leading-tight tracking-tight">{formatDate(date, "d 'de' MMMM")}</h3>
              </div>
              {missing.length === 0 && (
                <p className="shrink-0 text-right">
                  <span className="eyebrow block">Total del día</span>
                  <span className="font-serif text-xl font-medium leading-tight tracking-tight tabular-nums">{formatCurrency(total, currency)}</span>
                </p>
              )}
            </header>

            <ul className="border-t-2 border-foreground/80">
              {items.map(expense => {
                const look = categoryLook(expense.category)
                const Icon = look.icon
                const payer = nameOf(expense.paid_by)
                const editable = canEdit && !expense._pending
                const entry = (
                  <>
                    <Icon className="size-5 shrink-0 text-tone" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="font-serif text-lg font-medium leading-snug tracking-tight line-clamp-2">{expense.description}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-tone">{expense.category}</span>
                        {payer && <span>· Pagó {payer}</span>}
                        {expense.source === 'revolut' && (
                          <span className="inline-flex items-center gap-1">· <Landmark className="size-3" aria-hidden="true" /> Revolut</span>
                        )}
                      </span>
                      {expense._pending && (
                        <span data-tone="warning" className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-2 py-0.5 text-xs font-medium text-tone">
                          <CloudOff className="size-3.5 shrink-0" aria-hidden="true" /> Sin subir: se enviará al recuperar la conexión
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pl-1 font-serif text-lg font-medium tracking-tight tabular-nums">
                      {formatCurrency(expense.amount, expense.currency)}
                    </span>
                  </>
                )
                const line = '-ml-2 flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2.5 pl-2 pr-1 text-left'
                return (
                  <li
                    key={expense.id}
                    data-tone={look.tone}
                    className={cn('flex items-center gap-1 border-b border-border', expense._pending && 'border-dashed')}
                  >
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onEdit(expense)}
                        className={cn(line, 'rounded-lg transition-colors duration-150 hover:bg-secondary/60')}
                      >
                        {entry}
                      </button>
                    ) : (
                      <div className={line}>{entry}</div>
                    )}
                    {canEdit && (
                      <Menu
                        label={`Opciones de ${expense.description}`}
                        items={[
                          editable && { label: 'Editar', icon: Pencil, onSelect: () => onEdit(expense) },
                          { label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => onDelete(expense) },
                        ]}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
