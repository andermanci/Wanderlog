import { useEffect, useState } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { toast } from 'sonner'
import type { RoutePoint } from '@/lib/route'
import type { TravelMode } from './types'

interface Props {
  /** Id del <Map> sobre el que se dibuja. */
  mapId: string
  stops: RoutePoint[]
  mode: TravelMode
  /** Color de la línea (ya resuelto: Google Maps no entiende variables CSS). */
  color: string
}

// Dibuja el recorrido del plan sobre el mapa. Las paradas llegan ya con
// coordenadas (useBackfillRoutePoints las geocodifica y las guarda una vez).
// 1) Traza la ruta por carretera (Directions) con esas coordenadas.
// 2) Si no hay ruta por carretera, dibuja una línea aproximada que las conecta.
export function MapDirections({ mapId, stops, mode, color }: Props) {
  const map = useMap(mapId)
  const routesLib = useMapsLibrary('routes')
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null)

  useEffect(() => {
    if (!routesLib || !map) return
    const r = new routesLib.DirectionsRenderer({
      map,
      // Los marcadores numerados ya los pinta el mapa; evitamos duplicarlos.
      suppressMarkers: true,
      polylineOptions: { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 },
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el renderer es un objeto externo que nace con el mapa
    setRenderer(r)
    return () => r.setMap(null)
  }, [routesLib, map, color])

  useEffect(() => {
    if (!routesLib || !renderer || !map || stops.length < 2) return
    let cancelled = false
    let polyline: google.maps.Polyline | null = null

    const pts = stops
      .slice(0, 25)
      .filter((p): p is RoutePoint & { lat: number; lng: number } => p.lat != null && p.lng != null)
      .map(p => ({ lat: p.lat, lng: p.lng }))
    // Quita paradas consecutivas casi idénticas.
    const uniq = pts.filter((p, i) =>
      i === 0 || Math.abs(p.lat - pts[i - 1].lat) > 1e-4 || Math.abs(p.lng - pts[i - 1].lng) > 1e-4)
    if (uniq.length < 2) return

    // 1) Ruta por carretera con las coordenadas de las paradas.
    const svc = new routesLib.DirectionsService()
    svc.route({
      origin: uniq[0],
      destination: uniq[uniq.length - 1],
      waypoints: uniq.slice(1, -1).map(location => ({ location, stopover: true })),
      travelMode: google.maps.TravelMode[mode],
    }, (res, status) => {
      if (cancelled) return
      if (status === 'OK' && res) {
        renderer.setDirections(res)
      } else {
        // 2) Fallback: línea aproximada conectando las paradas.
        renderer.set('directions', null)
        polyline = new google.maps.Polyline({
          path: uniq, map,
          strokeColor: color, strokeWeight: 4, strokeOpacity: 0.85,
        })
        const bounds = new google.maps.LatLngBounds()
        uniq.forEach(p => bounds.extend(p))
        map.fitBounds(bounds, 56)
        toast.info(mode === 'WALKING'
          ? 'Recorrido aproximado: no hay ruta a pie entre todas las paradas.'
          : 'Recorrido aproximado: no hay ruta por carretera entre todas las paradas.')
      }
    })

    return () => { cancelled = true; polyline?.setMap(null) }
  }, [routesLib, renderer, map, stops, mode, color])

  return null
}
