import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PlaceResult } from './types'

// Una llamada a Places Text Search. Fuera del hook para poder usarla como
// queryFn cacheable.
async function searchPlacesByText(query: string, bias: { lat: number; lng: number } | null): Promise<PlaceResult[]> {
  const { places } = await google.maps.places.Place.searchByText({
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'types', 'websiteURI', 'googleMapsURI'],
    maxResultCount: 12,
    ...(bias ? { locationBias: bias } : {}),
  })
  return (places ?? []).filter(p => p.location).map(p => ({
    place_id: p.id,
    name: p.displayName ?? '',
    formatted_address: p.formattedAddress ?? '',
    rating: p.rating ?? undefined,
    lat: p.location!.lat(),
    lng: p.location!.lng(),
    types: p.types ?? [],
    website: p.websiteURI ?? undefined,
    url: p.googleMapsURI ?? undefined,
  }))
}

/**
 * El buscador de sitios del mapa (Places Text Search, con su caché). Solo busca
 * cuando la persona lo pide (Enter o el botón), nunca mientras escribe.
 * `onResults` recibe lo encontrado para que el mapa lo encuadre y seleccione.
 */
export function useMapSearch(map: google.maps.Map | null, onResults: (results: PlaceResult[]) => void) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(async () => {
    const q = input.trim()
    // Oculta el teclado del móvil al lanzar la búsqueda.
    inputRef.current?.blur()
    if (!q) return
    if (typeof google === 'undefined' || !google.maps?.places?.Place) {
      toast.error('El mapa todavía se está cargando. Inténtalo en un momento.')
      return
    }
    const center = map?.getCenter()
    setSearching(true)
    try {
      // Text Search es el SKU más caro de Google: la misma búsqueda desde el
      // mismo sitio no se vuelve a pagar (la caché está persistida, ver App.tsx).
      // El centro se redondea para que un pelín de scroll no invalide la caché.
      const bias = center ? { lat: +center.lat().toFixed(2), lng: +center.lng().toFixed(2) } : null
      const hits = await qc.fetchQuery({
        queryKey: ['placeSearch', q.toLowerCase(), bias] as const,
        queryFn: () => searchPlacesByText(q, bias),
        staleTime: Infinity,
        gcTime: 1000 * 60 * 60 * 24,
      })
      setResults(hits)
      onResults(hits)
      if (hits.length === 0) toast.info('No hemos encontrado nada con esa búsqueda')
    } catch (e) {
      console.error('[map] Place.searchByText error:', e)
      setResults([])
      toast.error('No se han podido buscar lugares')
    } finally {
      setSearching(false)
    }
  }, [input, map, qc, onResults])

  /** Quita los resultados y vacía el campo. */
  const clear = useCallback(() => {
    setResults([])
    setInput('')
  }, [])

  return { input, setInput, results, searching, search, clear, inputRef }
}
