import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Activity, ItineraryDay } from '@/types/database'
import {
  chooseMode, entryPoint, exitPoint, haversineKm, pairKey,
  type GeoPoint, type TravelLeg, type TravelMode,
} from '@/lib/travelTime'

interface PendingLeg {
  fromId: string
  toId: string
  mode: TravelMode
  origin: GeoPoint
  destination: GeoPoint
}

// Tramos entre paradas consecutivas de un día con coordenadas válidas, con
// el modo ya decidido (línea recta, sin llamar a la API todavía).
function legsForDay(items: Activity[]): PendingLeg[] {
  const legs: PendingLeg[] = []
  for (let i = 0; i < items.length - 1; i++) {
    const origin = exitPoint(items[i])
    const destination = entryPoint(items[i + 1])
    if (!origin || !destination) continue
    const mode = chooseMode(haversineKm(origin, destination))
    if (!mode) continue
    legs.push({ fromId: items[i].id, toId: items[i + 1].id, mode, origin, destination })
  }
  return legs
}

// Cambia si cambia el orden del día o las coordenadas de alguna parada
// (fuerza recalcular solo ese día tras un drag&drop).
function daySignature(items: Activity[]): string {
  return items.map(a => {
    const p = exitPoint(a) ?? entryPoint(a)
    return `${a.id}:${p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-'}`
  }).join('|')
}

function getDirections(
  service: google.maps.DirectionsService,
  request: google.maps.DirectionsRequest,
): Promise<google.maps.DirectionsResult | null> {
  return new Promise((resolve) => {
    service.route(request, (result, status) => {
      resolve(status === 'OK' && result ? result : null)
    })
  })
}

// Un tramo = una llamada a DirectionsService (mismo servicio que ya usa
// MapView.tsx para dibujar rutas). Se descarta DistanceMatrixService: es una
// API "legacy" que Google exige activar aparte en Cloud Console y, en este
// proyecto, no lo está — Directions ya funciona porque el mapa la usa hoy.
async function fetchDayLegs(
  legs: PendingLeg[],
  routesLib: google.maps.RoutesLibrary,
): Promise<Record<string, TravelLeg>> {
  const result: Record<string, TravelLeg> = {}
  const service = new routesLib.DirectionsService()

  await Promise.all(legs.map(async (leg) => {
    const response = await getDirections(service, {
      origin: leg.origin,
      destination: leg.destination,
      travelMode: google.maps.TravelMode[leg.mode],
    })
    const routeLeg = response?.routes[0]?.legs[0]
    if (routeLeg?.distance && routeLeg?.duration) {
      result[pairKey(leg.fromId, leg.toId)] = {
        mode: leg.mode,
        distanceMeters: routeLeg.distance.value,
        durationSeconds: routeLeg.duration.value,
      }
    }
  }))
  return result
}

interface UseTripTravelTimesParams {
  days: ItineraryDay[] | undefined
  combinedItemsFor: (dayId: string) => Activity[]
  collapsedDays: Set<string>
  routesLib: google.maps.RoutesLibrary | null
}

// Tiempos de viaje andando/en coche entre paradas consecutivas de cada día
// del itinerario. Cachea por día (staleTime infinito: solo se recalcula si
// cambia el orden o las coordenadas de ese día) y no gasta llamadas en días
// colapsados. Devuelve un Map<pairKey(fromId,toId), TravelLeg> con todos los
// días juntos.
export function useTripTravelTimes({ days, combinedItemsFor, collapsedDays, routesLib }: UseTripTravelTimesParams) {
  const results = useQueries({
    queries: (days ?? []).map(day => {
      const items = combinedItemsFor(day.id)
      const legs = legsForDay(items)
      const signature = daySignature(items)
      return {
        queryKey: ['travelTimes', day.id, signature] as const,
        queryFn: () => fetchDayLegs(legs, routesLib!),
        enabled: !!routesLib && legs.length > 0 && !collapsedDays.has(day.id),
        staleTime: Infinity,
        gcTime: 1000 * 60 * 60 * 24 * 7,
      }
    }),
  })

  return useMemo(() => {
    const map = new Map<string, TravelLeg>()
    results.forEach(r => {
      if (r.data) Object.entries(r.data).forEach(([k, v]) => map.set(k, v))
    })
    return map
  }, [results])
}
