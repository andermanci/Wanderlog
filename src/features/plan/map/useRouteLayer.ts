import { useMemo, useState } from 'react'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useBackfillRoutePoints } from '@/lib/queries/geocoding'
import { buildRoutePoints } from '@/lib/route'
import { usePlanStore } from '../planStore'
import type { TravelMode } from './types'

/**
 * Las paradas del plan y su recorrido: qué se pinta según el día elegido (que
 * se comparte con la lista de días por `usePlanStore`), si se dibuja la ruta y
 * en qué modo (a pie o en coche, recordado por viaje).
 */
export function useRouteLayer(tripId: string, mapReady: boolean, canEdit: boolean) {
  const { data: days } = useItineraryDays(tripId)
  const { data: activities } = useActivities(tripId)
  const mapDayId = usePlanStore(s => s.mapDayId)
  const setMapDay = usePlanStore(s => s.setMapDay)

  const rawRoutePoints = useMemo(
    () => buildRoutePoints(activities ?? [], days ?? []),
    [activities, days],
  )
  // Las paradas sin coordenadas se geocodifican UNA vez y se guardan en la
  // actividad; a partir de ahí llegan ya localizadas desde la base de datos.
  const routePoints = useBackfillRoutePoints(tripId, rawRoutePoints, mapReady, canEdit)
  // Paradas con coordenadas guardadas: se pintan siempre como pines numerados.
  const placedPoints = useMemo(
    () => routePoints.filter(p => p.lat != null && p.lng != null),
    [routePoints],
  )

  // El día elegido, como fecha (las paradas llevan fecha, no id de día). Si el
  // día ya no existe, se enseña todo.
  const dayDate = useMemo(
    () => (mapDayId === 'all' ? 'all' : days?.find(d => d.id === mapDayId)?.date ?? 'all'),
    [mapDayId, days],
  )

  // Chips de día: los días con alguna parada localizada (y el elegido, aunque
  // no tenga ninguna), en orden.
  const dayChips = useMemo(() => {
    const withStops = new Set(placedPoints.map(p => p.date).filter(Boolean))
    return (days ?? [])
      .filter(d => withStops.has(d.date) || d.date === dayDate)
      .map(d => ({ id: d.id, date: d.date }))
  }, [placedPoints, days, dayDate])

  const visiblePoints = useMemo(
    () => (dayDate === 'all' ? placedPoints : placedPoints.filter(p => p.date === dayDate)),
    [placedPoints, dayDate],
  )
  const routeStops = useMemo(
    () => (dayDate === 'all' ? routePoints : routePoints.filter(p => p.date === dayDate)),
    [routePoints, dayDate],
  )

  // ¿Se dibuja la ruta? La de todo el viaje, solo si se pide (botón «Recorrido»
  // o `?route=1`): cada trazado es una consulta a Google. La de un día concreto
  // sale al elegir el día, salvo que se apague a mano.
  const [tripRoute, setTripRoute] = useState(false)
  const [dayRouteOff, setDayRouteOff] = useState(false)
  const [lastDay, setLastDay] = useState(mapDayId)
  if (lastDay !== mapDayId) {
    setLastDay(mapDayId)
    setDayRouteOff(false)
  }
  const showRoute = dayDate === 'all' ? tripRoute : !dayRouteOff
  function setShowRoute(on: boolean) {
    if (dayDate === 'all') setTripRoute(on)
    else setDayRouteOff(!on)
  }
  /** Enseña el recorrido de todo el viaje. */
  function showTripRoute() {
    setMapDay('all')
    setTripRoute(true)
  }

  // Modo de la ruta dibujada, por viaje (urbano → a pie; roadtrip → coche).
  const travelModeKey = `wanderlog-travelmode-${tripId}`
  const [travelMode, setTravelModeState] = useState<TravelMode>(() =>
    (localStorage.getItem(travelModeKey) === 'WALKING' ? 'WALKING' : 'DRIVING'))
  function setTravelMode(m: TravelMode) {
    setTravelModeState(m)
    localStorage.setItem(travelModeKey, m)
  }

  return {
    days, activities,
    routePoints, placedPoints, visiblePoints, routeStops,
    mapDayId, setMapDay, dayDate, dayChips,
    showRoute, setShowRoute, showTripRoute,
    travelMode, setTravelMode,
  }
}
