import { haversineKm, type GeoPoint } from '@/lib/travelTime'

// Puntos que se pintan en el croquis y en el mapa del comparador.
export interface SketchPoint extends GeoPoint {
  n: number
  eat?: boolean
  title?: string
}

/** Lo que queda a más de esto de la mediana es otra ciudad (el tren del día): fuera del mapa. */
const CLIP_KM = 40

/** Filtro para quedarse con las paradas de la ciudad del día (cerca de la mediana). */
export function nearMedian(all: GeoPoint[]): (p: GeoPoint) => boolean {
  if (all.length === 0) return () => true
  const lats = all.map(p => p.lat).sort((x, y) => x - y)
  const lngs = all.map(p => p.lng).sort((x, y) => x - y)
  const med = { lat: lats[lats.length >> 1], lng: lngs[lngs.length >> 1] }
  return p => haversineKm(p, med) < CLIP_KM
}
