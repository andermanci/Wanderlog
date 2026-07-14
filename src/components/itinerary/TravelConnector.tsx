import { Footprints, Car } from 'lucide-react'
import { formatTravelLeg, type TravelLeg } from '@/lib/travelTime'
import type { ConflictSeverity } from '@/lib/conflicts'

interface TravelConnectorProps {
  leg: TravelLeg | undefined
  /** Si este tramo no da tiempo (error) o va justo (warning). */
  severity?: ConflictSeverity
}

// Línea entre dos actividades consecutivas del día con el tiempo/modo de
// desplazamiento (a pie o en coche, elegido automáticamente por distancia).
// Sin `leg` (faltan coordenadas, o aún cargando) degrada a un simple hueco,
// sin romper el ritmo visual de la lista.
//
// Cuando el trayecto no cabe en el hueco entre las dos actividades, se pinta en
// rojo (no llegas) o en ámbar (vas justo). En ese caso deja de ser aria-hidden:
// un aviso no puede quedar oculto a un lector de pantalla.
export function TravelConnector({ leg, severity }: TravelConnectorProps) {
  if (!leg) return <div className="h-2" aria-hidden="true" />

  const Icon = leg.mode === 'WALKING' ? Footprints : Car
  const color = severity === 'error' ? 'var(--destructive)'
    : severity === 'warning' ? 'var(--warning)'
      : null

  const label = severity === 'error' ? 'No da tiempo'
    : severity === 'warning' ? 'Vas justo'
      : null

  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden={severity ? undefined : 'true'}>
      <div className="w-px flex-1 min-h-[6px]"
        style={{ borderLeft: `1.5px dashed ${color ?? 'var(--border)'}` }} />
      <span
        className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 my-0.5 rounded-full whitespace-nowrap"
        style={color
          ? {
            background: `color-mix(in srgb, ${color} 10%, var(--card))`,
            border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
            color,
          }
          : { background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
      >
        <Icon size={11} style={{ color: color ?? 'var(--primary)' }} aria-hidden="true" />
        {formatTravelLeg(leg)}
        {label && <> · {label}</>}
      </span>
      <div className="w-px flex-1 min-h-[6px]"
        style={{ borderLeft: `1.5px dashed ${color ?? 'var(--border)'}` }} />
    </div>
  )
}
