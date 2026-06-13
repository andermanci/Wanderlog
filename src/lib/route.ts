import type { Activity, ItineraryDay } from '@/types/database'

export interface RoutePoint {
  key: string
  label: string
  location: string
  date: string
  kind?: 'origin' | 'destination'
  /** Id de la actividad de origen (para enlazar a su detalle). */
  activityId: string
  /** Coordenadas guardadas al elegir la ubicación (si las hay). */
  lat?: number | null
  lng?: number | null
}

// Paradas del recorrido EN ORDEN, solo de actividades con ubicación puesta:
// transporte con origen/destino, o cualquier actividad con dirección.
// (No adivina por el título). Deduplica ubicaciones consecutivas iguales.
export function buildRoutePoints(activities: Activity[], days: ItineraryDay[]): RoutePoint[] {
  const dayOrder = new Map(days.map((d, i) => [d.id, i]))
  const dayDate = new Map(days.map(d => [d.id, d.date]))
  const sorted = [...activities].sort((a, b) => {
    const da = dayOrder.get(a.day_id) ?? 0
    const db = dayOrder.get(b.day_id) ?? 0
    return da !== db ? da - db : a.order_index - b.order_index
  })

  const points: RoutePoint[] = []
  const push = (p: RoutePoint) => {
    const loc = p.location.trim()
    if (!loc) return
    if (points[points.length - 1]?.location.toLowerCase() === loc.toLowerCase()) return
    points.push({ ...p, location: loc })
  }

  for (const a of sorted) {
    const date = dayDate.get(a.day_id) ?? ''
    if (a.type === 'transport') {
      if (a.origin) push({ key: `${a.id}-o`, activityId: a.id, label: a.title, location: a.origin, date, kind: 'origin', lat: a.origin_lat, lng: a.origin_lng })
      if (a.destination) push({ key: `${a.id}-d`, activityId: a.id, label: a.title, location: a.destination, date, kind: 'destination', lat: a.destination_lat, lng: a.destination_lng })
    } else if (a.address) {
      push({ key: a.id, activityId: a.id, label: a.title, location: a.address, date, lat: a.lat, lng: a.lng })
    }
  }
  return points
}
