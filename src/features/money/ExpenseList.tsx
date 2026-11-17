import { CloudOff, Landmark, Pencil, Receipt, Trash2 } from 'lucide-react'
import { Badge, Empty, Menu, Row, RowList } from '@/design'
import type { PendingExpense } from '@/lib/queries/expenses'
import { sumConverted } from '@/lib/queries/rates'
import { formatCurrency, formatDate } from '@/lib/utils'
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

/** Vista «Lista»: los gastos agrupados por día, del más reciente al más antiguo. */
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
          <section key={date} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="title-card first-letter:uppercase">{formatDate(date, "EEEE d 'de' MMMM")}</h3>
              {missing.length === 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(total, currency)}</span>
              )}
            </div>
            <RowList>
              {items.map(expense => {
                const look = categoryLook(expense.category)
                const payer = nameOf(expense.paid_by)
                const editable = canEdit && !expense._pending
                return (
                  <Row
                    key={expense.id}
                    icon={look.icon}
                    tone={look.tone}
                    title={expense.description}
                    subtitle={(
                      <>
                        {expense.category}
                        {payer && ` · Pagó ${payer}`}
                        {expense._pending && ' · Sin subir: se enviará al recuperar la conexión'}
                      </>
                    )}
                    trailing={(
                      <>
                        {expense._pending && <Badge tone="warning" icon={CloudOff}>Sin subir</Badge>}
                        {expense.source === 'revolut' && <Badge tone="info" icon={Landmark}>Revolut</Badge>}
                        <span className="text-[0.9375rem] font-semibold text-foreground tabular-nums">
                          {formatCurrency(expense.amount, expense.currency)}
                        </span>
                      </>
                    )}
                    onClick={editable ? () => onEdit(expense) : undefined}
                    after={canEdit && (
                      <Menu
                        label={`Opciones de ${expense.description}`}
                        items={[
                          editable && { label: 'Editar', icon: Pencil, onSelect: () => onEdit(expense) },
                          { label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => onDelete(expense) },
                        ]}
                      />
                    )}
                  />
                )
              })}
            </RowList>
          </section>
        )
      })}
    </div>
  )
}
