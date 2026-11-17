import { useState } from 'react'
import { Footprints, Car, TrainFront, ChevronDown, Info } from 'lucide-react'
import { formatTravelLeg, type GeoPoint, type TravelLeg } from '@/lib/travelTime'
import type { ConflictSeverity } from '@/lib/conflicts'
import type { TransitRoute } from '@/types/database'
import { TransitSteps, LineChips } from './TransitSteps'
import { skipSummary } from '@/lib/transit/labels'
import { transitVerdict } from '@/lib/transit/exchange'

interface TravelConnectorProps {
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
}

// Línea entre dos actividades consecutivas del día con el tiempo/modo de
// desplazamiento (a pie o en coche, elegido automáticamente por distancia).
// Sin `leg` (faltan coordenadas, o aún cargando) degrada a un simple hueco,
// sin romper el ritmo visual de la lista.
//
// Si el trayecto tiene una ruta en transporte público que compensa, la píldora
// pasa a mostrar las líneas y se puede desplegar para ver estaciones y
// transbordos; el coche queda debajo, en pequeño, como alternativa.
//
// Cuando el trayecto no cabe en el hueco entre las dos actividades, se pinta en
// rojo (no llegas) o en ámbar (vas justo). En ese caso deja de ser aria-hidden:
// un aviso no puede quedar oculto a un lector de pantalla.
export function TravelConnector({ leg, severity, transit, drive, from, to, fromName, toName, onRedoTransit }: TravelConnectorProps) {
  const [open, setOpen] = useState(false)
  if (!leg) return <div className="h-2" aria-hidden="true" />

  const isTransit = leg.mode === 'TRANSIT' && !!transit
  const verdict = transit && from && to ? transitVerdict(transit, from, to) : null
  // Con ruta guardada siempre se puede desplegar: o los pasos, o por qué no
  // compensa y la comparación con andar y el coche.
  const expandable = !!transit && !!from && !!to
  const Icon = isTransit ? TrainFront : leg.mode === 'WALKING' ? Footprints : Car
  const color = severity === 'error' ? 'var(--destructive)'
    : severity === 'warning' ? 'var(--warning)'
      : null

  const label = severity === 'error' ? 'No da tiempo'
    : severity === 'warning' ? 'Vas justo'
      : null

  const text = isTransit
    ? `${Math.max(1, Math.round(leg.durationSeconds / 60))} min`
    : formatTravelLeg(leg)
  const hasChips = isTransit && (transit!.steps ?? []).some(s => s.kind !== 'walk')

  const pillStyle = color
    ? {
      background: `color-mix(in srgb, ${color} 10%, var(--card))`,
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      color,
    }
    : { background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }

  const pillContent = (
    <>
      {hasChips
        ? <LineChips steps={transit!.steps} max={3} pill />
        : <Icon size={11} className="flex-shrink-0" style={{ color: color ?? 'var(--primary)' }} aria-hidden="true" />}
      <span className={hasChips ? 'flex-shrink-0' : 'truncate'}>{text}</span>
      {label && <span className="flex-shrink-0">· {label}</span>}
      {expandable && (
        <ChevronDown size={11} className="flex-shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
      )}
    </>
  )
  const pillClass = `flex items-center gap-1.5 text-[11px] font-medium ${hasChips ? 'pl-1 pr-2 py-1' : 'px-2 py-0.5'} my-0.5 rounded-full whitespace-nowrap max-w-full`

  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden={severity || expandable ? undefined : 'true'}>
      <div className="w-px flex-1 min-h-[6px]"
        style={{ borderLeft: `1.5px dashed ${color ?? 'var(--border)'}` }} />
      {expandable ? (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className={`${pillClass} hover:brightness-95 transition`} style={pillStyle}>
          {pillContent}
        </button>
      ) : (
        <span className={pillClass} style={pillStyle}>{pillContent}</span>
      )}
      {/* El coche como alternativa, o el aviso de que no hay buena opción. */}
      {/* La alternativa con la que se ha comparado: andando si el transporte
          gana porque te ahorra caminar; si no, el coche. */}
      {isTransit && verdict?.why === 'less_walking' ? (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-80">
          <Footprints size={10} aria-hidden="true" /> {verdict.walkMinutes} min andando
        </span>
      ) : isTransit && drive && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-80">
          <Car size={10} aria-hidden="true" /> {formatTravelLeg(drive)}
        </span>
      )}
      {transit && !isTransit && expandable && (
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-80 hover:opacity-100">
          <Info size={10} aria-hidden="true" /> {skipSummary(transit, from!, to!)}
        </button>
      )}
      {open && expandable && (
        <TransitSteps route={transit!} from={from!} to={to!} fromName={fromName ?? 'Salida'} toName={toName ?? 'Llegada'} drive={drive} onRedo={onRedoTransit} />
      )}
      <div className="w-px flex-1 min-h-[6px]"
        style={{ borderLeft: `1.5px dashed ${color ?? 'var(--border)'}` }} />
    </div>
  )
}
