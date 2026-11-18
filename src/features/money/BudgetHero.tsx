import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/database'
import { categoryLook, toBase } from './categories'

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
  /** Los gastos, para trocear la barra por categoría. */
  expenses: Expense[]
  rates: Record<string, number> | undefined
}

/**
 * «¿Cuánto llevamos?»: la cifra enorme, el presupuesto al lado y una barra
 * troceada por categoría (cada tramo con el color de la suya) con su leyenda.
 */
export function BudgetHero({ total, budget, currency, otherTotals, missing, count, expenses, rates }: BudgetHeroProps) {
  const hasBudget = budget > 0
  const over = hasBudget && total > budget
  const pct = hasBudget ? (total / budget) * 100 : 0
  const converted = otherTotals.filter(([c]) => !missing.includes(c))

  const byCategory = new Map<string, number>()
  for (const e of expenses) {
    const v = toBase(e.amount, e.currency, currency, rates)
    if (v != null) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + v)
  }
  const segments = [...byCategory.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  // Con presupuesto la barra entera es el presupuesto (o lo gastado, si te has pasado);
  // sin él, la barra es el total y solo enseña cómo se reparte.
  const scale = hasBudget ? Math.max(budget, total) : total

  return (
    <section aria-label="Lo gastado en el viaje">
      <p className="eyebrow">Gastado</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-5xl font-medium leading-none tracking-tight tabular-nums md:text-7xl">
          {formatCurrency(total, currency)}
        </span>
        {hasBudget && (
          <span className="font-serif text-xl text-muted-foreground tabular-nums md:text-2xl">
            de {formatCurrency(budget, currency)}
          </span>
        )}
      </p>

      {(hasBudget || segments.length > 0) && scale > 0 && (
        <div className="relative mt-5">
          <div
            role="img"
            aria-label={hasBudget
              ? `Has gastado el ${Math.round(pct)} % del presupuesto`
              : 'Cómo se reparte lo gastado por categoría'}
            className="flex h-3.5 w-full gap-px overflow-hidden rounded-full bg-secondary"
          >
            {segments.map(([name, value]) => (
              <span
                key={name}
                data-tone={categoryLook(name).tone}
                title={`${name}: ${formatCurrency(value, currency)}`}
                className="h-full min-w-1 bg-tone transition-[width] duration-500 ease-out"
                // El ancho de cada tramo sale de los datos.
                style={{ width: `${(value / scale) * 100}%` }}
              />
            ))}
          </div>
          {over && (
            // Dónde acababa el presupuesto: lo que hay a su derecha es lo que te has pasado.
            <span
              aria-hidden="true"
              className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
              style={{ left: `${(budget / total) * 100}%` }}
            />
          )}
        </div>
      )}

      {hasBudget ? (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p data-tone={over ? 'danger' : pct >= 85 ? 'warning' : 'success'} className="font-serif text-xl font-medium tracking-tight text-tone tabular-nums">
            {over
              ? `Te has pasado ${formatCurrency(total - budget, currency)}`
              : `Te quedan ${formatCurrency(budget - total, currency)}`}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">{Math.round(pct)} % del presupuesto</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {count === 0
            ? 'Todavía no hay gastos apuntados.'
            : `En ${count} ${count === 1 ? 'gasto' : 'gastos'}. Este viaje no tiene presupuesto: puedes ponerlo en los ajustes del viaje.`}
        </p>
      )}

      {segments.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {segments.map(([name, value]) => (
            <li key={name} data-tone={categoryLook(name).tone} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-tone" />
              <span className="text-muted-foreground">{name}</span>
              <span className="font-medium tabular-nums">{formatCurrency(value, currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {(converted.length > 0 || missing.length > 0) && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {converted.length > 0 && (
            <>Incluye {converted.map(([c, v]) => formatCurrency(v, c)).join(' · ')}, pasado a {currency} con el cambio de hoy (aproximado). </>
          )}
          {missing.length > 0 && (
            <>No se ha podido convertir {otherTotals.filter(([c]) => missing.includes(c)).map(([c, v]) => formatCurrency(v, c)).join(' · ')}: no entra en el total.</>
          )}
        </p>
      )}
    </section>
  )
}
