import { useState } from 'react'
import { Car, ChevronDown, Footprints, Info, TrainFront } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTravelLeg, type GeoPoint, type TravelLeg } from '@/lib/travelTime'
import type { ConflictSeverity } from '@/lib/conflicts'
import type { TransitRoute } from '@/types/database'
import { skipSummary } from '@/lib/transit/labels'
import { transitVerdict } from '@/lib/transit/exchange'
import { TransitSteps, LineChips } from './TransitSteps'

export interface TravelConnectorProps {
  leg: TravelLeg | undefined
  /** Si este tramo no da tiempo (error) o va justo (warning). */
  severity?: ConflictSeverity
  /** Sugerencia de transporte público guardada (solo trayectos en coche). */
  transit?: TransitRoute
  /** El tramo en coche, para mostrarlo como alternativa cuando manda el transporte público. */
  drive?: TravelLeg
  /** Extremos del trayecto: centran la búsqueda de las estaciones en el mapa. */
  from?: GeoPoint
  to?: GeoPoint
  fromName?: string
  toName?: string
  /** Volver a pedir solo este trayecto a la IA. */
  onRedoTransit?: () => void
  /** Texto que antecede al trayecto: «Sales de Hotel X» al empezar el día. */
  label?: string
}

const MODE = {
  TRANSIT: { icon: TrainFront, name: 'En transporte público' },
  WALKING: { icon: Footprints, name: 'A pie' },
  DRIVING: { icon: Car, name: 'En coche' },
} as const

// El trayecto entre dos actividades seguidas del día: una píldora centrada
// sobre la línea del día con el modo (a pie, en coche o en transporte
// público), lo que se tarda y la distancia. Sin `leg` (faltan coordenadas, o
// aún cargando) degrada a un simple hueco, sin romper el ritmo de la lista.
//
// Si el trayecto tiene una ruta en transporte público que compensa, la píldora
// pasa a mostrar las líneas y se puede desplegar para ver estaciones y
// transbordos; el coche queda debajo, en pequeño, como alternativa.
//
// Cuando el trayecto no cabe en el hueco entre las dos actividades, se pinta en
// rojo (no llegas) o en ámbar (vas justo) y lo dice con texto. Solo se oculta a
// los lectores de pantalla cuando no hay aviso, ni nada que desplegar, ni rótulo.
export function TravelConnector({ leg, severity, transit, drive, from, to, fromName, toName, onRedoTransit, label }: TravelConnectorProps) {
  const [open, setOpen] = useState(false)
  if (!leg) return <div className="h-2" aria-hidden="true" />

  const isTransit = leg.mode === 'TRANSIT' && !!transit
  const verdict = transit && from && to ? transitVerdict(transit, from, to) : null
  // Con ruta guardada siempre se puede desplegar: o los pasos, o por qué no
  // compensa y la comparación con andar y el coche.
  const expandable = !!transit && !!from && !!to
  const mode = isTransit ? MODE.TRANSIT : leg.mode === 'WALKING' ? MODE.WALKING : MODE.DRIVING
  const Icon = mode.icon
  const tone = severity === 'error' ? 'danger' : severity === 'warning' ? 'warning' : undefined
  const alert = severity === 'error' ? 'No da tiempo' : severity === 'warning' ? 'Vas justo' : null

  const text = isTransit
    ? `${Math.max(1, Math.round(leg.durationSeconds / 60))} min`
    : formatTravelLeg(leg)
  const hasChips = isTransit && (transit!.steps ?? []).some(s => s.kind !== 'walk')

  // Opaca (bg-card) para tapar la línea del día que pasa por detrás; el tono
  // del aviso va encima, como un velo.
  const pill = cn(
    'relative inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card text-xs font-medium whitespace-nowrap',
    hasChips ? 'py-1 pr-2.5 pl-1' : 'px-2.5 py-1',
    tone
      ? 'border-tone-line bg-linear-to-r from-tone-soft to-tone-soft text-tone'
      : 'border-border text-muted-foreground',
  )
  const line = cn('min-h-2 w-0 flex-1 border-l-2 border-dashed', tone ? 'border-tone-line' : 'border-border-strong')

  const content = (
    <>
      {hasChips
        ? <LineChips steps={transit!.steps} max={3} pill />
        : <Icon className={cn('size-3.5 shrink-0', !tone && 'text-primary')} aria-hidden="true" />}
      <span className="sr-only">{mode.name}:</span>
      <span className={cn('tabular-nums', hasChips ? 'shrink-0' : 'truncate')}>{text}</span>
      {alert && <span className="shrink-0 font-semibold">· {alert}</span>}
      {expandable && <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />}
    </>
  )
  const alternative = 'flex items-center gap-1 text-2xs text-muted-foreground tabular-nums'

  return (
    <div
      data-tone={tone}
      className="flex flex-col items-center py-0.5"
      aria-hidden={severity || expandable || label ? undefined : 'true'}
    >
      <div className={line} />
      {label && <span className="max-w-full truncate bg-background px-2 py-0.5 text-xs text-muted-foreground">{label}</span>}
      {expandable ? (
        <button
          type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          // El «before» agranda la zona táctil a 44 px sin engordar la píldora.
          className={cn(pill, 'my-0.5 transition hover:brightness-95 before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[""]')}
        >
          {content}
        </button>
      ) : (
        <span className={cn(pill, 'my-0.5')}>{content}</span>
      )}
      {/* La alternativa con la que se ha comparado: andando si el transporte
          gana porque te ahorra caminar; si no, el coche. */}
      {isTransit && verdict?.why === 'less_walking' ? (
        <span className={alternative}>
          <Footprints className="size-3" aria-hidden="true" /> {verdict.walkMinutes} min andando
        </span>
      ) : isTransit && drive && (
        <span className={alternative}>
          <Car className="size-3" aria-hidden="true" /> <span className="sr-only">En coche:</span>{formatTravelLeg(drive)}
        </span>
      )}
      {/* Hay ruta guardada pero no compensa: se dice por qué, y se puede abrir. */}
      {transit && !isTransit && expandable && (
        <button
          type="button" onClick={() => setOpen(o => !o)}
          className={cn(alternative, 'min-h-6 max-w-full transition-colors hover:text-foreground')}
        >
          <Info className="size-3 shrink-0" aria-hidden="true" /> <span className="truncate">{skipSummary(transit, from!, to!)}</span>
        </button>
      )}
      {open && expandable && (
        <TransitSteps route={transit!} from={from!} to={to!} fromName={fromName ?? 'Salida'} toName={toName ?? 'Llegada'} drive={drive} onRedo={onRedoTransit} />
      )}
      <div className={line} />
    </div>
  )
}
