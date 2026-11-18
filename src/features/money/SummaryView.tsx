import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PieChart } from 'lucide-react'
import { Empty, toneColor } from '@/design'
import { formatCurrency, formatCurrencyShort, formatDate } from '@/lib/utils'
import type { Expense } from '@/types/database'
import { categoryLook, toBase } from './categories'

interface SummaryViewProps {
  expenses: Expense[]
  /** Divisa principal: los gráficos van en ella. */
  currency: string
  rates: Record<string, number> | undefined
  /** Total ya convertido. */
  total: number
}

/** Cambia cuando se alterna claro/oscuro, para volver a leer los colores del tema. */
function useThemeKey(): string {
  const [key, setKey] = useState(() => document.documentElement.className)
  useEffect(() => {
    const observer = new MutationObserver(() => setKey(document.documentElement.className))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return key
}

/** Vista «Resumen»: las cifras clave en grande, en qué se va el dinero y cuánto cada día. */
export function SummaryView({ expenses, currency, rates, total }: SummaryViewProps) {
  const themeKey = useThemeKey()
  // Recharts pinta SVG y no entiende data-tone: se le pasa el color ya resuelto.
  const colors = useMemo(() => {
    void themeKey
    return {
      axis: toneColor('neutral'),
      primary: toneColor('primary'),
    }
  }, [themeKey])

  const { byCategory, byDay } = useMemo(() => {
    const cat = new Map<string, number>()
    const day = new Map<string, number>()
    for (const e of expenses) {
      const v = toBase(e.amount, e.currency, currency, rates)
      if (v == null) continue
      cat.set(e.category, (cat.get(e.category) ?? 0) + v)
      day.set(e.date, (day.get(e.date) ?? 0) + v)
    }
    return {
      byCategory: [...cat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byDay: [...day.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ name: formatDate(date, 'd MMM'), value })),
    }
  }, [expenses, currency, rates])

  if (expenses.length === 0) {
    return (
      <Empty
        icon={PieChart}
        title="Aún no hay nada que resumir"
        description="Cuando apuntes gastos, aquí verás en qué se va el dinero y cuánto gastáis cada día."
      />
    )
  }

  const stats = [
    { label: 'Total gastado', value: formatCurrency(total, currency) },
    { label: 'Media por día', value: byDay.length ? formatCurrency(total / byDay.length, currency) : '—' },
    { label: 'Media por gasto', value: formatCurrency(total / expenses.length, currency) },
    { label: 'Gastos apuntados', value: String(expenses.length) },
  ]
  const tick = { fill: colors.axis, fontSize: 12 }
  const money = (v: unknown) => formatCurrencyShort(Number(v), currency)
  const top = byCategory[0]?.value ?? 0

  return (
    <div className="space-y-10">
      {/* Las cifras clave, grandes y sin caja. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="flex min-w-0 flex-col-reverse">
            <dt className="eyebrow mt-1">{s.label}</dt>
            <dd className="truncate font-serif text-2xl font-medium tracking-tight tabular-nums md:text-3xl">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        <section>
          <p className="eyebrow">Por categoría</p>
          <h3 className="title-section mt-0.5">En qué se ha ido el dinero</h3>
          {/* Barras con el color de cada categoría; la cifra y el porcentaje van escritos. */}
          <ul className="mt-4 space-y-4">
            {byCategory.map(d => {
              const look = categoryLook(d.name)
              const Icon = look.icon
              return (
                <li key={d.name} data-tone={look.tone}>
                  <div className="flex items-baseline gap-2.5">
                    <Icon className="size-4 shrink-0 self-center text-tone" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{d.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{total > 0 ? Math.round((d.value / total) * 100) : 0} %</span>
                    <span className="font-serif text-lg font-medium tracking-tight tabular-nums">{formatCurrency(d.value, currency)}</span>
                  </div>
                  <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-secondary">
                    <div className="h-full min-w-1 rounded-full bg-tone" style={{ width: `${top > 0 ? (d.value / top) * 100 : 0}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Importes en {currency}.</p>
        </section>

        <section>
          <p className="eyebrow">Por día</p>
          <h3 className="title-section mt-0.5">Cuánto se ha gastado cada día</h3>
          <div className="mt-4 h-60" role="img" aria-label="Gráfico de barras del gasto por día">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colors.axis} strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} minTickGap={12} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={money} />
                <Tooltip cursor={{ fill: colors.axis, fillOpacity: 0.1 }} content={<ChartTip currency={currency} />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} fill={colors.primary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}

interface ChartTipProps {
  currency: string
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ value?: unknown; payload?: { name?: string } }>
}

/** Etiqueta flotante de los gráficos, con los colores del tema. */
function ChartTip({ currency, active, label, payload }: ChartTipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-raised">
      <p className="text-xs text-muted-foreground">{payload[0].payload?.name ?? label}</p>
      <p className="font-semibold tabular-nums">{formatCurrency(Number(payload[0].value), currency)}</p>
    </div>
  )
}
