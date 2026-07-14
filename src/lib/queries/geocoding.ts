import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { geocodeQueryOptions } from '@/lib/geocode'
import type { RoutePoint } from '@/lib/route'
import type { GeoPoint } from '@/lib/travelTime'

// Columnas donde vive la coordenada según qué extremo de la actividad sea la
// parada (transporte: origen/destino; el resto: su dirección).
function coordsPatch(kind: RoutePoint['kind'], { lat, lng }: GeoPoint) {
  if (kind === 'origin') return { origin_lat: lat, origin_lng: lng }
  if (kind === 'destination') return { destination_lat: lat, destination_lng: lng }
  return { lat, lng }
}

// Paradas escritas a mano (o importadas) que no tienen coordenadas guardadas.
// Antes se resolvían con Place.searchByText EN CADA APERTURA del mapa y el
// resultado se tiraba: la llamada más cara del catálogo, repetida sin fin.
// Ahora se geocodifican una vez, se guardan en la actividad y ya nunca más.
export function useBackfillRoutePoints(
  tripId: string | undefined,
  points: RoutePoint[],
  ready: boolean,
  canEdit: boolean,
): RoutePoint[] {
  const qc = useQueryClient()
  const [resolved, setResolved] = useState<Record<string, GeoPoint>>({})
  // Direcciones ya intentadas en esta pantalla: si una no se puede localizar,
  // no se reintenta en cada render.
  const attempted = useRef(new Set<string>())

  const missing = useMemo(
    () => points.filter(p => p.lat == null || p.lng == null),
    [points],
  )

  useEffect(() => {
    if (!tripId || !ready || missing.length === 0) return
    let cancelled = false

    ;(async () => {
      let saved = false
      for (const p of missing) {
        if (attempted.current.has(p.key)) continue
        attempted.current.add(p.key)
        let coords: GeoPoint | null = null
        // fetchQuery reutiliza la caché persistida: si esta dirección ya se
        // geocodificó en este dispositivo, no vuelve a llamar a Google.
        try { coords = await qc.fetchQuery(geocodeQueryOptions(p.location)) } catch { coords = null }
        if (cancelled) return
        if (!coords) continue

        setResolved(prev => ({ ...prev, [p.key]: coords! }))
        if (!canEdit) continue
        const { error } = await supabase
          .from('activities')
          .update(coordsPatch(p.kind, coords))
          .eq('id', p.activityId)
        if (!error) saved = true
      }
      if (!cancelled && saved) {
        qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      }
    })()

    return () => { cancelled = true }
  }, [tripId, ready, canEdit, missing, qc])

  // Mientras la escritura en la BD no vuelve (o si el colaborador no puede
  // escribir), el mapa ya usa las coordenadas recién geocodificadas.
  return useMemo(
    () => points.map(p => (p.lat != null && p.lng != null) || !resolved[p.key] ? p : { ...p, ...resolved[p.key] }),
    [points, resolved],
  )
}
