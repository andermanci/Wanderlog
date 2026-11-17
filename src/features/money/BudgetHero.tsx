import { Card, Progress } from '@/design'
import { formatCurrency } from '@/lib/utils'

interface BudgetHeroProps {
  /** Total gastado, ya convertido a la divisa principal. */
  total: number
  /** Presupuesto del viaje (0 si no tiene). */
  budget: number
  currency: string
  /** Totales en otras divisas, tal cual se pagaron. */
  otherTotals: [string, number][]
  /** Divisas que no se han podido convertir (no entran en el total). */
  missing: string[]
  count: number
}

/** «¿Cuánto llevamos?»: la cifra grande, el presupuesto y lo que queda. */
export function BudgetHero({ total, budget, currency, otherTotals, missing, count }: BudgetHeroProps) {
  const hasBudget = budget > 0
  const over = hasBudget && total > budget
  const pct = hasBudget ? (total / budget) * 100 : 0
  const converted = otherTotals.filter(([c]) => !missing.includes(c))

  return (
    <Card pad="lg">
      <p className="eyebrow">Gastado</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="title-hero tabular-nums">{formatCurrency(total, currency)}</span>
        {hasBudget && (
          <span className="text-base text-muted-foreground tabular-nums">de {formatCurrency(budget, currency)}</span>
        )}
      </p>

      {hasBudget ? (
        <>
          <Progress
            value={pct}
            tone={over ? 'danger' : pct >= 85 ? 'warning' : 'primary'}
            label="Presupuesto gastado"
            className="mt-4 h-2.5"
          />
          <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span data-tone={over ? 'danger' : 'success'} className="font-semibold text-tone tabular-nums">
              {over
                ? `Te has pasado ${formatCurrency(total - budget, currency)}`
                : `Te quedan ${formatCurrency(budget - total, currency)}`}
            </span>
            <span className="text-muted-foreground tabular-nums">{Math.round(pct)} % del presupuesto</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {count === 0
            ? 'Todavía no hay gastos apuntados.'
            : `En ${count} ${count === 1 ? 'gasto' : 'gastos'}. Este viaje no tiene presupuesto: puedes ponerlo en los ajustes del viaje.`}
        </p>
      )}

      {(converted.length > 0 || missing.length > 0) && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {converted.length > 0 && (
            <>Incluye {converted.map(([c, v]) => formatCurrency(v, c)).join(' · ')}, pasado a {currency} con el cambio de hoy (aproximado). </>
          )}
          {missing.length > 0 && (
            <>No se ha podido convertir {otherTotals.filter(([c]) => missing.includes(c)).map(([c, v]) => formatCurrency(v, c)).join(' · ')}: no entra en el total.</>
          )}
        </p>
      )}
    </Card>
  )
}
