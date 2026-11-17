import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Eye, MapPinOff, Navigation, WifiOff } from 'lucide-react'
import { Button, Chip, Empty, Menu, Notice, Row, RowList } from '@/design'
import { DirectionsPanel } from '@/features/common/Directions'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { buildRoutePoints } from '@/lib/route'
import type { DirectionsTarget } from '@/lib/directions'
import { formatDate } from '@/lib/utils'
import { usePlanStore } from '../planStore'
import { copyAddress } from '../ideas/places'

/**
 * Sin conexión el mapa de Google no puede cargar. En su lugar, las paradas del
 * plan (ya guardadas en el dispositivo) con su dirección para copiar y «Cómo
 * llegar»: las apps de mapas del móvil sí tienen mapas sin conexión.
 */
export function OfflineStops({ tripId }: { tripId: string }) {
  const { data: days } = useItineraryDays(tripId)
  const { data: activities } = useActivities(tripId)
  const mapDayId = usePlanStore(s => s.mapDayId)
  const setMapDay = usePlanStore(s => s.setMapDay)
  const navigate = useNavigate()
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)

  const points = useMemo(() => buildRoutePoints(activities ?? [], days ?? []), [activities, days])
  const dayDate = mapDayId === 'all' ? 'all' : days?.find(d => d.id === mapDayId)?.date ?? 'all'
  const chips = useMemo(() => {
    const withStops = new Set(points.map(p => p.date).filter(Boolean))
    return (days ?? []).filter(d => withStops.has(d.date))
  }, [points, days])
  const stops = dayDate === 'all' ? points : points.filter(p => p.date === dayDate)

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background px-4 pb-28 pt-5 md:px-6 md:pb-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <Notice tone="warning" icon={WifiOff} title="El mapa no se puede ver sin conexión">
          Aquí tienes las paradas de tu plan. Un consejo: antes de salir, descarga la zona en tu app de
          mapas para poder orientarte sin datos.
        </Notice>

        {chips.length > 1 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Ver las paradas de un día">
            <Chip selected={dayDate === 'all'} onClick={() => setMapDay('all')}>Todo</Chip>
            {chips.map(d => (
              <Chip key={d.id} selected={dayDate === d.date} onClick={() => setMapDay(d.id)}>
                {formatDate(d.date, 'EEE d MMM')}
              </Chip>
            ))}
          </div>
        )}

        {stops.length === 0 ? (
          <Empty
            icon={MapPinOff}
            title="No hay paradas con dirección"
            description="Cuando una actividad del plan tenga dirección, saldrá aquí para que puedas ir aunque no tengas conexión."
          />
        ) : (
          <RowList>
            {stops.map((p, i) => (
              <Row
                key={p.key}
                leading={
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold tabular-nums text-accent-foreground">
                    {i + 1}
                  </span>
                }
                title={p.label}
                subtitle={[p.date ? formatDate(p.date, 'd MMM') : null, p.location].filter(Boolean).join(' · ')}
                after={
                  <>
                    <Button
                      variant="soft" size="sm"
                      onClick={() => setDirectionsTo({ name: p.label, lat: p.lat, lng: p.lng, address: p.location })}
                    >
                      <Navigation /> Cómo llegar
                    </Button>
                    <Menu
                      label={`Más opciones de ${p.label}`}
                      items={[
                        { label: 'Copiar dirección', icon: Copy, onSelect: () => copyAddress(p.location) },
                        { label: 'Ver actividad', icon: Eye, onSelect: () => navigate(`/trips/${tripId}/itinerary/${p.activityId}`) },
                      ]}
                    />
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </div>
      <DirectionsPanel target={directionsTo} onClose={() => setDirectionsTo(null)} />
    </div>
  )
}
