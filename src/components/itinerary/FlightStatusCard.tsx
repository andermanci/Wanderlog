import { Plane, RefreshCw } from 'lucide-react'
import { useFlightStatus, type FlightPoint, type FlightStatus } from '@/lib/queries/flightStatus'

// Estado real del vuelo: retraso, terminal y puerta. Solo aparece los días de
// alrededor del vuelo y solo si el proveedor tiene el dato; el resto del tiempo
// no se pinta nada (es información de apoyo, no un elemento fijo de la pantalla).

type Tone = 'ok' | 'warn' | 'bad' | 'info'

// Estados de AeroDataBox → texto en español + tono. Los que no estén aquí se
// enseñan tal cual antes que inventarse una traducción.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  Expected: { label: 'Previsto', tone: 'ok' },
  CheckIn: { label: 'Facturando', tone: 'info' },
  Boarding: { label: 'Embarcando', tone: 'info' },
  GateClosed: { label: 'Puerta cerrada', tone: 'warn' },
  Departed: { label: 'Despegado', tone: 'info' },
  EnRoute: { label: 'En vuelo', tone: 'info' },
  Approaching: { label: 'Aterrizando', tone: 'info' },
  Arrived: { label: 'Aterrizado', tone: 'ok' },
  Delayed: { label: 'Retrasado', tone: 'warn' },
  Canceled: { label: 'Cancelado', tone: 'bad' },
  CanceledUncertain: { label: 'Posible cancelación', tone: 'bad' },
  Diverted: { label: 'Desviado', tone: 'bad' },
  Unknown: { label: 'Sin datos', tone: 'info' },
}

const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  bad: 'var(--destructive)',
  info: 'var(--info)',
}

const hhmm = (iso: string | null) => (iso ? iso.slice(11, 16) : null)

// Un retraso de 5 minutos no es noticia; a partir de un cuarto de hora sí.
const SIGNIFICANT_DELAY_MIN = 15

function delayText(min: number): string {
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const dur = h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
  return min > 0 ? `Retraso de ${dur}` : `Adelantado ${dur}`
}

function statusOf(flight: FlightStatus): { label: string; tone: Tone } {
  const known = flight.status ? STATUS_MAP[flight.status] : undefined
  if (known) return known
  if (flight.status) return { label: flight.status, tone: 'info' }
  return { label: 'Sin datos', tone: 'info' }
}

// Un extremo del vuelo (salida o llegada): hora, y si cambió, la nueva junto a
// la vieja tachada — que es como se lee un panel de aeropuerto.
function PointRow({ label, point }: { label: string; point: FlightPoint }) {
  const scheduled = hhmm(point.scheduled)
  const estimated = hhmm(point.estimated)
  const changed = !!scheduled && !!estimated && scheduled !== estimated

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        {changed ? (
          <>
            <span className="text-sm line-through text-muted-foreground tabular-nums">{scheduled}</span>
            <span className="font-medium tabular-nums" style={{ color: 'var(--warning)' }}>{estimated}</span>
          </>
        ) : (
          <span className="font-medium tabular-nums">{estimated ?? scheduled ?? '—'}</span>
        )}
        {point.iata && <span className="text-xs text-muted-foreground">{point.iata}</span>}
      </div>
      {(point.terminal || point.gate || point.checkInDesk) && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {[
            point.terminal && `Terminal ${point.terminal}`,
            point.gate && `Puerta ${point.gate}`,
            point.checkInDesk && `Mostrador ${point.checkInDesk}`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

export function FlightStatusCard({ flightNumber, date }: {
  flightNumber: string | null | undefined
  /** Fecha del vuelo (YYYY-MM-DD), la del día del itinerario. */
  date: string | null | undefined
}) {
  const { data: flight, isLoading, isFetching, refetch } = useFlightStatus(flightNumber, date)

  // Ni mientras carga ni cuando no hay dato se ocupa sitio: si el proveedor no
  // sabe nada de este vuelo, la pantalla se queda como estaba.
  if (isLoading || !flight) return null

  const { label, tone } = statusOf(flight)
  const color = TONE_COLOR[tone]
  const delay = flight.departure.delayMinutes ?? flight.arrival.delayMinutes
  const showDelay = delay != null && Math.abs(delay) >= SIGNIFICANT_DELAY_MIN

  return (
    <div className="rounded-xl p-4 surface">
      <div className="flex items-center gap-2 mb-3">
        <Plane size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
        <p className="text-xs text-muted-foreground uppercase tracking-widest flex-1">Estado del vuelo</p>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Actualizar estado del vuelo"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-start gap-3">
        <PointRow label="Sale" point={flight.departure} />
        <Plane size={14} className="text-muted-foreground mt-4 flex-shrink-0 rotate-90" aria-hidden="true" />
        <PointRow label="Llega" point={flight.arrival} />
      </div>

      {showDelay && (
        <p className="text-xs font-medium mt-3 px-2 py-1 rounded-md w-fit"
          style={{ background: `color-mix(in srgb, ${TONE_COLOR.warn} 12%, transparent)`, color: TONE_COLOR.warn }}>
          {delayText(delay!)}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground mt-2">
        {[flight.number, flight.airline, flight.aircraft].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}
