import { ArrowRight } from 'lucide-react'
import { ActivityIcon, Badge, Card } from '@/design'
import { cn } from '@/lib/utils'
import { wallToUtcMs, comparableZones, formatDuration } from '@/lib/timezone'
import type { Activity } from '@/types/database'

interface FlightTimesProps {
  activity: Activity
  /** Fecha del día de salida (yyyy-MM-dd). */
  startDate: string
  /** Fecha del día de llegada, si acaba otro día. */
  endDate?: string | null
}

/**
 * Horas de un vuelo o transporte, con su duración REAL aunque cruce husos.
 *
 * Las horas guardadas son las del billete: la salida en hora local del origen y
 * la llegada en hora local del destino. Restarlas a pelo da un disparate, así
 * que se convierten a instantes usando el huso de cada punta.
 *
 * Sin husos (aún sin resolver, o sin ubicación) se muestran las dos horas y
 * ya: nunca una duración inventada.
 */
export function FlightTimes({ activity, startDate, endDate }: FlightTimesProps) {
  const { start_time, end_time, origin, destination, origin_tz, destination_tz } = activity
  if (!start_time || !end_time) return null

  const arrivalDate = endDate ?? startDate
  const knownZones = !!origin_tz && !!destination_tz
  const crossesZones = knownZones && origin_tz !== destination_tz

  const minutes = comparableZones(origin_tz, destination_tz)
    ? (wallToUtcMs(arrivalDate, end_time, destination_tz)
      - wallToUtcMs(startDate, start_time, origin_tz)) / 60_000
    : NaN

  // Una duración negativa o absurda no se muestra: probablemente falta el día de
  // llegada. El motor de conflictos lo dice con todas las letras.
  const duration = minutes > 0 && minutes < 36 * 60 ? formatDuration(minutes) : ''

  const dayShift = daysBetween(startDate, arrivalDate)

  return (
    <Card sunken pad="sm" data-tone={activity.type}>
      <div className="flex items-center justify-between gap-3">
        <Endpoint label="Salida" time={start_time} city={crossesZones ? origin : null} tz={origin_tz} />

        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
          {duration && (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-tone">
              <ActivityIcon type={activity.type} className="size-3.5" /> {duration}
            </span>
          )}
          <span className="flex w-full items-center gap-1 text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border-strong" />
            <ArrowRight className="size-3.5 shrink-0" />
          </span>
        </div>

        <Endpoint
          label="Llegada"
          time={end_time}
          city={crossesZones ? destination : null}
          tz={destination_tz}
          dayShift={dayShift}
          align="right"
        />
      </div>

      {/* Sin esta línea, «12:00 → 08:30 · 13 h 30 min» parece un error. */}
      {crossesZones && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Cada hora es la hora local de su ciudad.
        </p>
      )}
    </Card>
  )
}

function Endpoint({ label, time, city, tz, dayShift = 0, align = 'left' }: {
  label: string
  time: string
  city: string | null
  tz: string | null
  dayShift?: number
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="eyebrow">{label}</p>
      <div className={cn('flex items-center gap-1.5', align === 'right' && 'justify-end')} title={tz ?? undefined}>
        <span className="text-2xl font-semibold tabular-nums">{time.slice(0, 5)}</span>
        {dayShift > 0 && <Badge tone="primary">+{dayShift} día{dayShift > 1 ? 's' : ''}</Badge>}
      </div>
      {city && <p className="truncate text-xs text-muted-foreground">{city}</p>}
    </div>
  )
}

// Diferencia de días declarada (la que puso la persona con el día de llegada),
// no deducida de las horas.
function daysBetween(from: string, to: string): number {
  if (from === to) return 0
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}
