import { Plane, RefreshCw } from 'lucide-react'
import { Badge, Card, IconButton, type Tone } from '@/design'
import { cn } from '@/lib/utils'
import { useFlightStatus, type FlightPoint, type FlightStatus } from '@/lib/queries/flightStatus'

// Estado real del vuelo: retraso, terminal y puerta. Solo aparece los días de
// alrededor del vuelo y solo si el proveedor tiene el dato; el resto del tiempo
// no se pinta nada.

// Estados de AeroDataBox → texto + tono. Los que no estén aquí se enseñan tal
// cual antes que inventarse una traducción.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  Expected: { label: 'Previsto', tone: 'success' },
  CheckIn: { label: 'Facturando', tone: 'info' },
  Boarding: { label: 'Embarcando', tone: 'info' },
  GateClosed: { label: 'Puerta cerrada', tone: 'warning' },
  Departed: { label: 'Despegado', tone: 'info' },
  EnRoute: { label: 'En vuelo', tone: 'info' },
  Approaching: { label: 'Aterrizando', tone: 'info' },
  Arrived: { label: 'Aterrizado', tone: 'success' },
  Delayed: { label: 'Retrasado', tone: 'warning' },
  Canceled: { label: 'Cancelado', tone: 'danger' },
  CanceledUncertain: { label: 'Posible cancelación', tone: 'danger' },
  Diverted: { label: 'Desviado', tone: 'danger' },
  Unknown: { label: 'Sin datos', tone: 'info' },
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

// Un extremo del vuelo: hora, y si cambió, la nueva junto a la vieja tachada,
// que es como se lee un panel de aeropuerto.
function Point({ label, point }: { label: string; point: FlightPoint }) {
  const scheduled = hhmm(point.scheduled)
  const estimated = hhmm(point.estimated)
  const changed = !!scheduled && !!estimated && scheduled !== estimated
  const extra = [
    point.terminal && `Terminal ${point.terminal}`,
    point.gate && `Puerta ${point.gate}`,
    point.checkInDesk && `Mostrador ${point.checkInDesk}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0 flex-1">
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        {changed && <span className="text-sm tabular-nums text-muted-foreground line-through">{scheduled}</span>}
        <span className={cn('text-2xl font-semibold tabular-nums', changed && 'text-warning')}>{estimated ?? scheduled ?? '—'}</span>
        {point.iata && <span className="text-sm text-muted-foreground">{point.iata}</span>}
      </p>
      {extra && <p className="mt-0.5 text-sm font-medium">{extra}</p>}
    </div>
  )
}

export function FlightStatusCard({ flightNumber, date }: {
  flightNumber: string | null | undefined
  /** Fecha del vuelo (YYYY-MM-DD), la del día del plan. */
  date: string | null | undefined
}) {
  const { data: flight, isLoading, isFetching, refetch } = useFlightStatus(flightNumber, date)

  // Ni mientras carga ni cuando no hay dato se ocupa sitio.
  if (isLoading || !flight) return null

  const { label, tone } = statusOf(flight)
  const delay = flight.departure.delayMinutes ?? flight.arrival.delayMinutes
  const showDelay = delay != null && Math.abs(delay) >= SIGNIFICANT_DELAY_MIN

  return (
    <Card pad="sm" className="space-y-3">
      <div className="flex items-center gap-2">
        <span data-tone="flight" className="text-tone"><Plane className="size-4.5" aria-hidden="true" /></span>
        <p className="title-card flex-1">Estado del vuelo</p>
        <Badge tone={tone}>{label}</Badge>
        <IconButton label="Actualizar estado del vuelo" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
        </IconButton>
      </div>
      <div className="flex items-start gap-4">
        <Point label="Sale" point={flight.departure} />
        <Point label="Llega" point={flight.arrival} />
      </div>
      {showDelay && <Badge tone="warning">{delayText(delay!)}</Badge>}
      <p className="text-xs text-muted-foreground">{[flight.number, flight.airline, flight.aircraft].filter(Boolean).join(' · ')}</p>
    </Card>
  )
}
