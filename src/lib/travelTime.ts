import type { Activity } from '@/types/database'

export type TravelMode = 'WALKING' | 'DRIVING'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface TravelLeg {
  mode: TravelMode
  distanceMeters: number
  durationSeconds: number
}

const EARTH_RADIUS_KM = 6371
// Por debajo: se muestra "caminando". Por encima: "en coche" (como Wanderlog).
export const WALK_THRESHOLD_KM = 1.1
// Por encima: probablemente otra ciudad/salto de página, no se pinta conector.
export const MAX_CONNECTOR_KM = 150

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

// null = fuera de rango razonable, no se muestra conector.
export function chooseMode(straightLineKm: number): TravelMode | null {
  if (straightLineKm > MAX_CONNECTOR_KM) return null
  return straightLineKm > WALK_THRESHOLD_KM ? 'DRIVING' : 'WALKING'
}

// Punto de salida de una actividad (para medir el tramo hacia la siguiente).
export function exitPoint(a: Activity): GeoPoint | null {
  if (a.type === 'transport') {
    return a.destination_lat != null && a.destination_lng != null
      ? { lat: a.destination_lat, lng: a.destination_lng } : null
  }
  return a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null
}

// Punto de entrada de una actividad (para medir el tramo desde la anterior).
export function entryPoint(a: Activity): GeoPoint | null {
  if (a.type === 'transport') {
    return a.origin_lat != null && a.origin_lng != null
      ? { lat: a.origin_lat, lng: a.origin_lng } : null
  }
  return a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null
}

export function pairKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`
}

export function formatTravelLeg(leg: TravelLeg): string {
  const mins = Math.max(1, Math.round(leg.durationSeconds / 60))
  const dist = leg.distanceMeters >= 1000
    ? `${(leg.distanceMeters / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
    : `${Math.round(leg.distanceMeters)} m`
  return `${mins} min · ${dist}`
}

export function formatDayTotal(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60)
  if (mins <= 0) return ''
  if (mins < 60) return `≈ ${mins} min en trayectos`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `≈ ${h} h${m ? ` ${m} min` : ''} en trayectos`
}
