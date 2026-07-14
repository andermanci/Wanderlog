import { Plane, ArrowRight } from 'lucide-react'
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
 * Duración real de un vuelo o transporte que cruza husos.
 *
 * Las horas guardadas son las del billete: la salida en hora local del origen y
 * la llegada en hora local del destino. Restarlas a pelo da un disparate, así
 * que se convierten a instantes usando el huso de cada punta.
 *
 * Sin husos (backfill pendiente, o sin ubicación) se muestran las dos horas y
 * ya: nunca una duración inventada. Es justo el bug que esto arregla.
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
    <div className="rounded-xl border border-border p-3" style={{ background: 'var(--secondary)' }}>
      <div className="flex items-center justify-between gap-2">
        <Endpoint time={start_time} city={crossesZones ? origin : null} tz={origin_tz} />

        <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0 px-1">
          {duration && (
            <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap"
              style={{ color: 'var(--primary)' }}>
              <Plane size={11} /> {duration}
            </span>
          )}
          <span className="w-full flex items-center gap-1 text-muted-foreground">
            <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <ArrowRight size={11} className="flex-shrink-0" />
          </span>
        </div>

        <Endpoint
          time={end_time}
          city={crossesZones ? destination : null}
          tz={destination_tz}
          dayShift={dayShift}
          align="right"
        />
      </div>

      {/* Sin esta línea, "12:00 → 08:30 · 13 h 30 min" parece un error. */}
      {crossesZones && (
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Horas locales de cada ciudad.
        </p>
      )}
    </div>
  )
}

function Endpoint({ time, city, tz, dayShift = 0, align = 'left' }: {
  time: string
  city: string | null
  tz: string | null
  dayShift?: number
  align?: 'left' | 'right'
}) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="flex items-baseline gap-1.5" title={tz ?? undefined}>
        <span className="font-serif text-lg font-medium">{time.slice(0, 5)}</span>
        {dayShift > 0 && (
          <span className="text-[10px] font-medium px-1 py-0.5 rounded whitespace-nowrap"
            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
            +{dayShift} día{dayShift > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {city && <p className="text-xs text-muted-foreground truncate">{city}</p>}
    </div>
  )
}

// Diferencia de días declarada (la que puso el usuario con el día de llegada),
// no deducida de las horas.
function daysBetween(from: string, to: string): number {
  if (from === to) return 0
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}
