import { useMemo } from 'react'
import { CalendarRange, Sparkles, Wallet, Clock3 } from 'lucide-react'
import {
  formatDate, formatCurrency, effectiveStatus, countdownLabel,
  STATUS_LABELS, STATUS_COLORS,
} from '@/lib/utils'
import type { Activity, ItineraryDay, Trip } from '@/types/database'
import { format } from 'date-fns'

// Visión de conjunto del viaje sobre la lista de días: días, actividades,
// coste planificado, rango de fechas y estado/progreso.
export function TripOverview({ trip, days, activities }: {
  trip: Trip
  days: ItineraryDay[]
  activities: Activity[]
}) {
  const status = effectiveStatus(trip)
  const statusColor = STATUS_COLORS[status] ?? 'var(--muted-foreground)'

  const plannedCost = useMemo(
    () => activities.reduce((sum, a) => sum + (a.price ?? 0), 0),
    [activities],
  )

  // Progreso del viaje en curso: cuántos días han transcurrido (incluido hoy).
  const progress = useMemo(() => {
    if (status !== 'in_progress' || days.length === 0) return null
    const today = format(new Date(), 'yyyy-MM-dd')
    const elapsed = days.filter(d => d.date <= today).length
    return { elapsed, total: days.length, pct: Math.round((elapsed / days.length) * 100) }
  }, [status, days])

  const stats = [
    { icon: CalendarRange, label: days.length === 1 ? 'día' : 'días', value: String(days.length) },
    { icon: Sparkles, label: activities.length === 1 ? 'actividad' : 'actividades', value: String(activities.length) },
    ...(plannedCost > 0 ? [{ icon: Wallet, label: 'planificado', value: formatCurrency(plannedCost) }] : []),
  ]

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 mb-6"
      style={{
        background: 'color-mix(in srgb, var(--primary) 5%, var(--card))',
        borderColor: 'color-mix(in srgb, var(--primary) 18%, var(--border))',
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Estadísticas */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-7">
          {stats.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center gap-2.5">
                <span
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
                >
                  <Icon size={17} />
                </span>
                <div className="leading-tight">
                  <p className="font-serif text-lg font-medium whitespace-nowrap">{s.value}</p>
                  <p className="text-xs text-muted-foreground -mt-0.5">{s.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Estado + fechas */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end sm:gap-1.5 flex-shrink-0">
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ background: `color-mix(in srgb, ${statusColor} 16%, transparent)`, color: statusColor }}
          >
            {status === 'in_progress' || status === 'completed'
              ? STATUS_LABELS[status]
              : countdownLabel(trip.start_date)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <Clock3 size={12} className="flex-shrink-0" />
            {formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}
          </span>
        </div>
      </div>

      {/* Barra de progreso (solo viaje en curso) */}
      {progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Día {progress.elapsed} de {progress.total}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
            <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: 'var(--gradient-primary)' }} />
          </div>
        </div>
      )}
    </div>
  )
}
