import type { GeoPoint } from '@/lib/travelTime'

// Geocodificar una dirección cuesta dinero, y el resultado nunca cambia. Todas
// las llamadas pasan por esta clave de caché de react-query (persistida en
// localStorage, ver App.tsx) con staleTime infinito: la misma dirección se
// geocodifica una sola vez por dispositivo, aunque no se pueda guardar en la BD.
export const geocodeKey = (address: string) => ['geocode', address.trim().toLowerCase()] as const

export const geocodeQueryOptions = (address: string) => ({
  queryKey: geocodeKey(address),
  queryFn: () => geocodeAddress(address),
  staleTime: Infinity,
  gcTime: 1000 * 60 * 60 * 24 * 60,
})

// Devuelve null si la dirección no existe (resultado válido y cacheable);
// cualquier otro fallo se propaga para que react-query no lo cachee como bueno.
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const { results } = await new google.maps.Geocoder()
    .geocode({ address })
    .catch((err: unknown) => {
      if ((err as { code?: string })?.code === 'ZERO_RESULTS') return { results: [] }
      throw err
    })
  const loc = results[0]?.geometry?.location
  return loc ? { lat: loc.lat(), lng: loc.lng() } : null
}
