import { Footprints, Car } from 'lucide-react'
import { formatTravelLeg, type TravelLeg } from '@/lib/travelTime'

interface TravelConnectorProps {
  leg: TravelLeg | undefined
}

// Línea entre dos actividades consecutivas del día con el tiempo/modo de
// desplazamiento (a pie o en coche, elegido automáticamente por distancia).
// Sin `leg` (faltan coordenadas, o aún cargando) degrada a un simple hueco,
// sin romper el ritmo visual de la lista.
export function TravelConnector({ leg }: TravelConnectorProps) {
  if (!leg) return <div className="h-2" aria-hidden="true" />

  const Icon = leg.mode === 'WALKING' ? Footprints : Car

  return (
    <div className="flex flex-col items-center py-0.5 ml-[2.75rem]" aria-hidden="true">
      <div className="w-px flex-1 min-h-[6px]" style={{ borderLeft: '1.5px dashed var(--border)' }} />
      <span
        className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 my-0.5 rounded-full whitespace-nowrap"
        style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
      >
        <Icon size={11} style={{ color: 'var(--primary)' }} />
        {formatTravelLeg(leg)}
      </span>
      <div className="w-px flex-1 min-h-[6px]" style={{ borderLeft: '1.5px dashed var(--border)' }} />
    </div>
  )
}
