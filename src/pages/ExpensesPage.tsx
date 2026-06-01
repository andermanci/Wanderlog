import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Plus, Receipt, Trash2, Loader2, Landmark } from 'lucide-react'
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
import { useExpenses, useCreateExpense, useDeleteExpense } from '@/lib/queries/expenses'
import { useTrip } from '@/lib/queries/trips'
import { TripHeader } from '@/components/trips/TripHeader'
import { EXPENSE_CATEGORIES, formatCurrency, formatDate } from '@/lib/utils'
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
  const createExpense = useCreateExpense()
  const deleteExpense = useDeleteExpense()

  const [formOpen, setFormOpen] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { category: 'Otros', currency: 'EUR', date: new Date().toISOString().slice(0, 10) },
  })

  const total = expenses?.reduce((s, e) => s + e.amount, 0) ?? 0
  const budget = trip?.budget_total ?? 0
  const pct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0

  // Datos agrupados por categoría para el gráfico
  const chartData = EXPENSE_CATEGORIES.map(cat => ({
    name: cat,
    value: expenses?.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0) ?? 0,
  })).filter(d => d.value > 0)

  // Gasto por día (ordenado por fecha)
  const byDay = Object.entries(
    (expenses ?? []).reduce<Record<string, number>>((acc, e) => {
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
    <div className="max-w-4xl mx-auto px-6 py-8">
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

      {/* Resumen presupuesto */}
      {budget > 0 && (
        <div className="p-5 rounded-xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Presupuesto total</span>
            <span className="text-sm text-muted-foreground">{formatCurrency(total)} / {formatCurrency(budget)}</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</span>
            <span className={`text-xs font-medium ${total > budget ? 'text-destructive' : 'text-green-400'}`}>
              {total > budget
                ? `Excedido ${formatCurrency(total - budget)}`
                : `Disponible: ${formatCurrency(budget - total)}`}
            </span>
          </div>
        </div>
      )}

      {/* Totales rápidos */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-serif font-medium" style={{ color: 'var(--primary)' }}>{formatCurrency(total)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total gastado</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-serif font-medium">{expenses?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Transacciones</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-2xl font-serif font-medium">
            {expenses?.length ? formatCurrency(total / expenses.length) : '—'}
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
            <span className="text-sm text-muted-foreground">Media: <span style={{ color: 'var(--primary)' }}>{formatCurrency(avgPerDay)}</span>/día</span>
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
