import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PieChart } from 'lucide-react'
import { Card, Empty, Section, toneColor } from '@/design'
import { EXPENSE_CATEGORIES, formatCurrency, formatCurrencyShort, formatDate } from '@/lib/utils'
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

/** Vista «Resumen»: en qué se va el dinero y cuánto cada día. */
export function SummaryView({ expenses, currency, rates, total }: SummaryViewProps) {
  const themeKey = useThemeKey()
  // Recharts pinta SVG y no entiende data-tone: se le pasa el color ya resuelto.
  const colors = useMemo(() => {
    void themeKey
    return {
      axis: toneColor('neutral'),
      primary: toneColor('primary'),
      byCategory: Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, toneColor(categoryLook(c).tone)])),
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
    { label: 'Gastos apuntados', value: String(expenses.length) },
    { label: 'Media por gasto', value: formatCurrency(total / expenses.length, currency) },
    { label: 'Media por día', value: byDay.length ? formatCurrency(total / byDay.length, currency) : '—' },
  ]
  const tick = { fill: colors.axis, fontSize: 12 }
  const money = (v: unknown) => formatCurrencyShort(Number(v), currency)

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <Card key={s.label} pad="sm" className="flex flex-col-reverse text-center">
            <dt className="mt-0.5 text-xs text-muted-foreground">{s.label}</dt>
            <dd className="truncate title-section tabular-nums">{s.value}</dd>
          </Card>
        ))}
      </dl>

      <Section title="Por categoría" description={`En qué se ha ido el dinero, en ${currency}.`}>
        <Card>
          <div className="h-56" role="img" aria-label="Gráfico de barras del gasto por categoría">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colors.axis} strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} tickFormatter={shortLabel} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={money} />
                <Tooltip cursor={{ fill: colors.axis, fillOpacity: 0.1 }} content={<ChartTip currency={currency} />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {byCategory.map(d => <Cell key={d.name} fill={colors.byCategory[d.name] ?? colors.primary} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* La misma información en texto: no depende del color ni del gráfico. */}
          <ul className="mt-4 grid gap-x-6 gap-y-2 border-t border-border pt-4 sm:grid-cols-2">
            {byCategory.map(d => (
              <li key={d.name} data-tone={categoryLook(d.name).tone} className="flex items-center gap-2.5 text-sm">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-tone" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-muted-foreground tabular-nums">{total > 0 ? Math.round((d.value / total) * 100) : 0} %</span>
                <span className="font-semibold tabular-nums">{formatCurrency(d.value, currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Por día" description="Cuánto se ha gastado cada día del viaje.">
        <Card>
          <div className="h-56" role="img" aria-label="Gráfico de barras del gasto por día">
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
        </Card>
      </Section>
    </div>
  )
}

/** En pantallas estrechas las ocho categorías no caben enteras bajo las barras. */
function shortLabel(name: string): string {
  return name.length > 7 ? `${name.slice(0, 5)}.` : name
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
