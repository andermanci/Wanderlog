import type { DirectionsTarget } from '@/lib/directions'
import type { Activity } from '@/types/database'

/**
 * A dónde se navega para ir a una actividad: sus coordenadas, o las de
 * destino/origen (transportes), o su dirección en texto. null si no hay a dónde ir.
 */
export function activityTarget(a: Activity): DirectionsTarget | null {
  const lat = a.lat ?? a.destination_lat ?? a.origin_lat
  const lng = a.lng ?? a.destination_lng ?? a.origin_lng
  const address = a.address ?? a.destination ?? a.origin
  if (lat == null && !address) return null
  return { name: a.title, lat, lng, address }
}
