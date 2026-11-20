import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-google-maps'

/**
 * Une las paradas del día en orden con una línea discontinua recta. No es la
 * ruta por calles (esa es «Recorrido», que consulta a Google y cuesta): solo
 * deja ver de un vistazo el orden y hacia dónde va el día, sin coste.
 */
export function DayPath({ mapId, points, color }: {
  mapId: string
  points: { lat: number; lng: number }[]
  color: string
}) {
  const map = useMap(mapId)
  const key = points.map(p => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!map || points.length < 2) return
    const line = new google.maps.Polyline({
      map,
      path: points,
      strokeOpacity: 0,
      clickable: false,
      zIndex: 1,
      icons: [{
        // Trazos cortos con el color de la app, repetidos a lo largo de la línea.
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, strokeWeight: 3, scale: 3 },
        offset: '0',
        repeat: '12px',
      }],
    })
    return () => line.setMap(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume los puntos
  }, [map, key, color])
  return null
}
