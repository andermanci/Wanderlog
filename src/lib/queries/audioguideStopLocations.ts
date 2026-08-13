import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { audioguideKeys } from '@/lib/queries/audioguides'
import { geocodeQueryOptions } from '@/lib/geocode'
import { haversineKm, type GeoPoint } from '@/lib/travelTime'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { AudioguideScope } from '@/lib/audioguide/scope'
import type { Activity, AudioguideStop, ItineraryDay, Trip } from '@/types/database'
import { cityNames } from '@/lib/cities'

// Una parada geocodificada más lejos que esto del lugar de la actividad no es
// esa parada: el Geocoder casi siempre devuelve ALGO, y un título narrativo
// ("El nacimiento del barrio") acaba resolviendo en la otra punta del mundo.
const MAX_DISTANCIA_KM = 25

// Un resultado de estos tipos significa "no he encontrado tu sitio, te dejo la
// ciudad/el código postal". Situar ahí la parada sería mentir con un pin.
const TIPOS_DEMASIADO_VAGOS = [
  'locality', 'sublocality', 'postal_code', 'country', 'plus_code',
  'administrative_area_level_1', 'administrative_area_level_2',
  'administrative_area_level_3', 'administrative_area_level_4',
]

interface ResultadoGeocodificado {
  punto: GeoPoint
  /** Google avisa de que ha tenido que "adivinar" para casar la consulta. */
  aproximado: boolean
}

const stopGeocodeKey = (consulta: string) => ['geocode-stop', consulta.trim().toLowerCase()] as const

// Geocodificación pensada para paradas: además del punto guarda si el
// resultado es fiable. Las paradas de interior ("El óculo", "La sala de los
// mapas") no son un sitio buscable y deben quedarse SIN pin, no con uno
// aproximado en mitad de la ciudad. Devuelve null = no hay sitio (cacheable).
async function geocodeStop(consulta: string): Promise<ResultadoGeocodificado | null> {
  const { results } = await new google.maps.Geocoder()
    .geocode({ address: consulta })
    .catch((err: unknown) => {
      if ((err as { code?: string })?.code === 'ZERO_RESULTS') return { results: [] }
      throw err
    })
  const best = results[0]
  const loc = best?.geometry?.location
  if (!best || !loc) return null
  const tipos = best.types ?? []
  return {
    punto: { lat: loc.lat(), lng: loc.lng() },
    aproximado: !!best.partial_match || tipos.every(t => TIPOS_DEMASIADO_VAGOS.includes(t)),
  }
}

const stopGeocodeQueryOptions = (consulta: string) => ({
  queryKey: stopGeocodeKey(consulta),
  queryFn: () => geocodeStop(consulta),
  staleTime: Infinity,
  gcTime: 1000 * 60 * 60 * 24 * 60,
})

export interface StopLocationsState {
  /** Paradas con las coordenadas recién resueltas ya aplicadas. */
  stops: AudioguideStop[]
  /** Hay geocodificación en curso (para avisar en la interfaz). */
  locating: boolean
}

export function stopPoint(stop: AudioguideStop): GeoPoint | null {
  return stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null
}

// El ancla de una audioguía de sitio es el propio sitio; la de una audioguía de
// ciudad, la ciudad. Estas dos funciones son lo único que sabe de esa
// diferencia: el backfill de abajo ya solo ve "un texto y quizá un punto".
export function activityGeocodeContext(activity: Activity | undefined, trip: Trip | undefined) {
  return {
    contexto: activity?.address || trip?.destination || '',
    punto: activity?.lat != null && activity?.lng != null
      ? { lat: activity.lat, lng: activity.lng }
      : null,
  }
}

export function dayGeocodeContext(day: ItineraryDay | undefined, trip: Trip | undefined) {
  const ciudades = cityNames(day)
  return {
    // "Venecia, Italia" acota muchísimo mejor que "Venecia" a secas: el
    // Geocoder resuelve homónimos (hay una Venecia en Florida) con el país.
    contexto: ciudades.length > 0
      ? [ciudades.join(', '), trip?.destination].filter(Boolean).join(', ')
      : trip?.destination || '',
    // Un día no tiene coordenadas guardadas: el ancla sale de geocodificar el
    // contexto una sola vez, igual que ya se hacía con las actividades sin lat/lng.
    punto: null as GeoPoint | null,
  }
}

// Localiza UNA vez las paradas que aún no tienen coordenadas y guarda el
// resultado en la base de datos, igual que hace useBackfillRoutePoints con las
// paradas del itinerario. Así las audioguías creadas antes de que existiera el
// mapa se sitúan solas con abrirlas, y el intento no se repite nunca más:
// también se guarda el fallo (geo_status = 'unlocated').
export function useBackfillStopLocations(
  /** Ámbito de la audioguía. El llamante debe memoizarlo: va en las dependencias del efecto. */
  scope: AudioguideScope | null,
  stops: AudioguideStop[],
  /** Texto que sitúa la audioguía (dirección del sitio o ciudad del día). */
  contexto: string,
  /** Punto ya conocido, si lo hay. El llamante debe memoizarlo. */
  anclaGuardada: GeoPoint | null,
  ready: boolean,
): StopLocationsState {
  const qc = useQueryClient()
  const online = useOnlineStatus()
  const [resolved, setResolved] = useState<Record<string, GeoPoint>>({})
  const [locating, setLocating] = useState(false)
  // Paradas ya intentadas en esta pantalla: si una no se puede localizar, no se
  // reintenta en cada render mientras se espera a que la BD devuelva el estado.
  const attempted = useRef(new Set<string>())

  const pending = useMemo(
    () => stops.filter(s => s.lat == null && s.geo_status === 'pending'),
    [stops],
  )

  useEffect(() => {
    if (!scope || !ready || !online || pending.length === 0) return
    let cancelled = false

    ;(async () => {
      const porIntentar = pending.filter(s => !attempted.current.has(s.id))
      if (porIntentar.length === 0) return
      porIntentar.forEach(s => attempted.current.add(s.id))

      let ancla = anclaGuardada
      if (!ancla && contexto) {
        try { ancla = await qc.fetchQuery(geocodeQueryOptions(contexto)) } catch { ancla = null }
      }
      if (cancelled) return

      setLocating(true)
      let algunaGuardada = false
      for (const stop of porIntentar) {
        const consulta = [stop.place_query || stop.title, contexto].filter(Boolean).join(', ')
        let res: ResultadoGeocodificado | null
        // fetchQuery reutiliza la caché persistida: la misma consulta no vuelve
        // a llegar a Google aunque se abra la audioguía en otro viaje.
        try {
          res = await qc.fetchQuery(stopGeocodeQueryOptions(consulta))
        } catch {
          // Cuota agotada, sin red, error del servicio... Un fallo pasajero NO
          // puede dejar la parada marcada como "no se puede localizar" para
          // siempre: se deja en 'pending' y se reintenta en otra sesión. Y se
          // corta aquí, porque lo que ha fallado a una le va a fallar a todas.
          attempted.current.delete(stop.id)
          break
        }
        if (cancelled) return

        const coords = res && !res.aproximado ? res.punto : null
        const valida = !!coords && (!ancla || haversineKm(ancla, coords) <= MAX_DISTANCIA_KM)
        const patch = valida && coords
          ? { lat: coords.lat, lng: coords.lng, geo_status: 'located' as const }
          : { geo_status: 'unlocated' as const }

        if (valida && coords) setResolved(prev => ({ ...prev, [stop.id]: coords }))
        const { error } = await supabase.from('audioguide_stops').update(patch).eq('id', stop.id)
        if (!error) algunaGuardada = true
      }

      if (cancelled) return
      setLocating(false)
      if (algunaGuardada) qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })
    })()

    return () => { cancelled = true }
  }, [scope, ready, online, pending, anclaGuardada, contexto, qc])

  // Mientras la escritura no vuelve de la BD, el mapa ya usa lo recién resuelto.
  const conCoordenadas = useMemo(
    () => stops.map(s => (s.lat != null || !resolved[s.id])
      ? s
      : { ...s, lat: resolved[s.id].lat, lng: resolved[s.id].lng, geo_status: 'located' as const }),
    [stops, resolved],
  )

  return { stops: conCoordenadas, locating }
}
