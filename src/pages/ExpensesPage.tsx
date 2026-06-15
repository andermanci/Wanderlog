import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Plus, Receipt, Trash2, Loader2, Landmark, Zap, CloudOff, ListPlus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useExpenses, useCreateExpense, useDeleteExpense, type PendingExpense } from '@/lib/queries/expenses'
import { useExchangeRates, sumConverted } from '@/lib/queries/rates'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { TripHeader } from '@/components/trips/TripHeader'
import { useAuthStore } from '@/store/authStore'
import { EXPENSE_CATEGORIES, formatCurrency, formatDate, sumByCurrency } from '@/lib/utils'
import type { Expense } from '@/types/database'

const CHART_COLORS = [
  'var(--primary)', '#6366f1', '#22c55e', '#f97316',
  '#06b6d4', '#a855f7', '#ec4899', '#14b8a6',
]

const schema = z.object({
  description: z.string().min(1, 'Descripción obligatoria'),
  category: z.string().min(1),
  amount: z.coerce.number().positive('El importe debe ser mayor que 0'),
  currency: z.string().min(1),
  date: z.string().min(1, 'Fecha obligatoria'),
})

type FormValues = z.infer<typeof schema>

export function ExpensesPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId!)
  const { data: expenses, isLoading } = useExpenses(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { profile } = useAuthStore()
  const createExpense = useCreateExpense()
  const deleteExpense = useDeleteExpense()

  const [formOpen, setFormOpen] = useState(false)

  // Actividades del itinerario con precio que aún NO se han registrado como
  // gasto (se ofrecen para añadir; el enlace activity_id evita duplicar).
  const dayDateById = new Map((days ?? []).map(d => [d.id, d.date]))
  const linkedActs = new Set((expenses ?? []).map(e => e.activity_id).filter(Boolean))
  const pendingActs = (activities ?? []).filter(a => a.price != null && a.price > 0 && !linkedActs.has(a.id))

  function expenseCategoryFor(type: string) {
    if (type === 'flight' || type === 'transport') return 'Transporte'
    if (type === 'hotel') return 'Alojamiento'
    if (type === 'restaurant') return 'Comida'
    return 'Actividades'
  }
  function addActivityExpense(a: NonNullable<typeof activities>[number]) {
    createExpense.mutate({
      trip_id: tripId!,
      activity_id: a.id,
      description: a.title,
      category: expenseCategoryFor(a.type),
      amount: a.price!,
      currency: profile?.default_currency ?? 'EUR',
      date: dayDateById.get(a.day_id) ?? new Date().toISOString().slice(0, 10),
    })
  }

  // Gasto rápido: importe + categoría, fecha de hoy, divisa principal.
  const [quickAmount, setQuickAmount] = useState('')
  const [quickDesc, setQuickDesc] = useState('')
  const [quickCat, setQuickCat] = useState('Comida')

  function quickAdd() {
    const amount = Number(quickAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) return
    createExpense.mutate({
      trip_id: tripId!,
      description: quickDesc.trim() || quickCat,
      category: quickCat,
      amount,
      currency: profile?.default_currency ?? 'EUR',
      date: new Date().toISOString().slice(0, 10),
    })
    setQuickAmount('')
    setQuickDesc('')
  }

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { category: 'Otros', currency: 'EUR', date: new Date().toISOString().slice(0, 10) },
  })

  // Las divisas no se mezclan: totales separados por divisa. El presupuesto
  // y las gráficas usan la divisa principal del usuario.
  const mainCurrency = profile?.default_currency ?? 'EUR'
  const totalsByCurrency = sumByCurrency(expenses ?? [])
  const otherTotals = Object.entries(totalsByCurrency).filter(([c]) => c !== mainCurrency)
  const mainExpenses = (expenses ?? []).filter(e => e.currency === mainCurrency)
  // Total REAL: convierte todas las divisas a la principal (tipo de cambio en vivo).
  const { data: rates } = useExchangeRates(mainCurrency)
  const { total, missing } = sumConverted(expenses ?? [], mainCurrency, rates)
  const hasConversion = otherTotals.length > 0 && missing.length < otherTotals.length
  const budget = trip?.budget_total ?? 0
  const pct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0

  // Datos agrupados por categoría para el gráfico (divisa principal)
  const chartData = EXPENSE_CATEGORIES.map(cat => ({
    name: cat,
    value: mainExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(d => d.value > 0)

  // Gasto por día (divisa principal, ordenado por fecha)
  const byDay = Object.entries(
    mainExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.date] = (acc[e.date] ?? 0) + e.amount
      return acc
    }, {})
  ).sort((a, b) => a[0].localeCompare(b[0]))
  const dayChartData = byDay.map(([date, value]) => ({ name: formatDate(date, 'dd MMM'), value }))
  const avgPerDay = byDay.length > 0 ? total / byDay.length : 0

  async function onSubmit(values: FormValues) {
    await createExpense.mutateAsync({ ...values, trip_id: tripId! })
    setFormOpen(false)
    reset({ category: 'Otros', currency: 'EUR', date: new Date().toISOString().slice(0, 10) })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Gastos" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl font-medium">Gastos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Control del presupuesto</p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
          className="gap-2"
        >
          <Plus size={16} />
          Añadir gasto
        </Button>
      </div>

      {/* Actividades del itinerario con precio sin registrar como gasto */}
      {pendingActs.length > 0 && (
        <div className="p-4 rounded-xl mb-6" style={{ background: 'color-mix(in srgb, var(--primary) 6%, var(--card))', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <ListPlus size={15} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-medium">Precios del itinerario</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0"
              disabled={createExpense.isPending}
              onClick={() => pendingActs.forEach(addActivityExpense)}>
              Añadir todos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {pendingActs.length} actividad{pendingActs.length > 1 ? 'es' : ''} del itinerario con precio. ¿Las registras como gasto?
          </p>
          <div className="space-y-1.5">
            {pendingActs.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{a.title}</span>
                <span className="font-medium tabular-nums flex-shrink-0">{formatCurrency(a.price!, profile?.default_currency ?? 'EUR')}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 flex-shrink-0" style={{ color: 'var(--primary)' }}
                  disabled={createExpense.isPending} onClick={() => addActivityExpense(a)}>
                  <Plus size={13} /> Añadir
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gasto rápido */}
      <div className="p-4 rounded-xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-3">
          <Zap size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-medium">Gasto rápido</span>
          <span className="text-xs text-muted-foreground">· hoy, en {profile?.default_currency ?? 'EUR'}</span>
        </div>
        <div className="flex gap-2 mb-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={quickAmount}
            onChange={(e) => setQuickAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            className="w-24 text-base font-medium"
          />
          <Input
            placeholder="¿En qué? (opcional)"
            value={quickDesc}
            onChange={(e) => setQuickDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            className="flex-1 text-base md:text-sm"
          />
          <Button
            onClick={quickAdd}
            disabled={createExpense.isPending || !quickAmount.trim()}
            style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
          >
            {createExpense.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          </Button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {EXPENSE_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setQuickCat(cat)}
              className="text-xs px-2.5 py-1 rounded-full border transition-all"
              style={{
                borderColor: quickCat === cat ? 'var(--primary)' : 'var(--border)',
                color: quickCat === cat ? 'var(--primary)' : 'var(--muted-foreground)',
                background: quickCat === cat ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen presupuesto */}
      {budget > 0 && (
        <div className="p-5 rounded-xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Presupuesto total</span>
            <span className="text-sm text-muted-foreground">{formatCurrency(total, mainCurrency)} / {formatCurrency(budget, mainCurrency)}</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</span>
            <span className={`text-xs font-medium ${total > budget ? 'text-destructive' : 'text-green-400'}`}>
              {total > budget
                ? `Excedido ${formatCurrency(total - budget, mainCurrency)}`
                : `Disponible: ${formatCurrency(budget - total, mainCurrency)}`}
            </span>
          </div>
          {hasConversion && (
            <p className="text-xs text-muted-foreground mt-2">
              Incluye conversión de {otherTotals.map(([c]) => c).join(', ')} a {mainCurrency} (cambio aproximado).
              {missing.length > 0 && ` No se pudo convertir: ${missing.join(', ')}.`}
            </p>
          )}
        </div>
      )}

      {/* Totales rápidos */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-lg sm:text-2xl font-serif font-medium truncate" style={{ color: 'var(--primary)' }}>{formatCurrency(total, mainCurrency)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total gastado{hasConversion ? ` (en ${mainCurrency})` : ''}</p>
          {otherTotals.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              incl. {otherTotals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}
            </p>
          )}
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-lg sm:text-2xl font-serif font-medium">{expenses?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Transacciones</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-lg sm:text-2xl font-serif font-medium truncate">
            {mainExpenses.length ? formatCurrency(total / mainExpenses.length, mainCurrency) : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Media por gasto</p>
        </div>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="p-5 rounded-xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="font-serif text-lg mb-4">Por categoría</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}€`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                formatter={(value: unknown) => [formatCurrency(Number(value)), 'Gasto']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gasto por día */}
      {dayChartData.length > 0 && (
        <div className="p-5 rounded-xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg">Por día</h2>
            <span className="text-sm text-muted-foreground">Media: <span style={{ color: 'var(--primary)' }}>{formatCurrency(avgPerDay, mainCurrency)}</span>/día</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dayChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
              <Tooltip
                contentStyle={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                formatter={(value: unknown) => [formatCurrency(Number(value)), 'Gasto']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lista de gastos */}
      <h2 className="font-serif text-lg mb-4">Detalle de gastos</h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !expenses?.length ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Receipt size={48} className="mb-4 text-muted-foreground" />
          <h3 className="font-serif text-xl mb-2">Sin gastos registrados</h3>
          <p className="text-muted-foreground text-sm">Lleva el control de tus gastos durante el viaje</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense, i) => (
            <motion.div
              key={expense.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group flex items-center gap-4 p-3 rounded-lg"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{
                  background: `${CHART_COLORS[EXPENSE_CATEGORIES.indexOf(expense.category) % CHART_COLORS.length]}22`,
                  color: CHART_COLORS[EXPENSE_CATEGORIES.indexOf(expense.category) % CHART_COLORS.length],
                }}
              >
                {expense.category[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium line-clamp-1">{expense.description}</p>
                  {(expense as PendingExpense)._pending && (
                    <span aria-label="Pendiente de subir (sin conexión)" title="Pendiente de subir (sin conexión)">
                      <CloudOff size={12} className="text-muted-foreground flex-shrink-0" />
                    </span>
                  )}
                  {expense.source === 'revolut' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 gap-1"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)' }}>
                      <Landmark size={9} /> Revolut
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(expense.date)} · {expense.category}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm" style={{ color: 'var(--primary)' }}>
                  {formatCurrency(expense.amount, expense.currency)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6 opacity-60 hover:opacity-100 text-destructive transition-opacity"
                  onClick={() => deleteExpense.mutate({ id: expense.id, tripId: tripId! })}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Nuevo gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input {...register('description')} placeholder="Ej: Cena en restaurante" />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={watch('category')} onValueChange={(v) => setValue('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importe *</Label>
                <Input type="number" step="0.01" {...register('amount')} placeholder="0.00" />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={watch('currency')} onValueChange={(v) => setValue('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'MXN', 'ARS', 'COP'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <Input type="date" {...register('date')} />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
                Añadir gasto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
