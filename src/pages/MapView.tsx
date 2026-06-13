import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { APIProvider, Map, AdvancedMarker, Pin, ColorScheme, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import {
  Search, Star, MapPin, ExternalLink, Bookmark, X, Calendar, Route,
  LocateFixed, Loader2, List, Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { useFavoritePlaces, useSaveFavoritePlace, useDeleteFavoritePlace } from '@/lib/queries/places'
import { useCreateActivity, useItineraryDays, useUpsertDays, useActivities } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { placeTypeToCategory, getCategoryColor } from '@/lib/maps'
import { buildRoutePoints, type RoutePoint } from '@/lib/route'
import { cn, PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS } from '@/lib/utils'
import type { FavoritePlace } from '@/types/database'
import { toast } from 'sonner'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

// Dibuja la ruta del itinerario sobre el mapa de la app.
// 1) Usa las coordenadas guardadas de cada parada; geocodifica solo las que falten.
// 2) Traza la ruta por carretera (Directions) con esas coordenadas.
// 3) Si no hay ruta por carretera, dibuja una línea aproximada que las conecta.
function MapDirections({ stops }: { stops: RoutePoint[] }) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const placesLib = useMapsLibrary('places')
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null)

  useEffect(() => {
    if (!routesLib || !map) return
    const r = new routesLib.DirectionsRenderer({
      map,
      // Los marcadores numerados ya los pinta el mapa; evitamos duplicarlos.
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#bf4d22', strokeWeight: 5, strokeOpacity: 0.9 },
    })
    setRenderer(r)
    return () => r.setMap(null)
  }, [routesLib, map])

  useEffect(() => {
    if (!routesLib || !placesLib || !renderer || !map || stops.length < 2) return
    let cancelled = false
    let polyline: google.maps.Polyline | null = null

    ;(async () => {
      // 1) Coordenadas guardadas directamente; Places solo para las que falten.
      const resolved = await Promise.all(stops.slice(0, 25).map(async (p) => {
        if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng }
        try {
          const { places } = await placesLib.Place.searchByText({
            textQuery: p.location, fields: ['location'], maxResultCount: 1,
          })
          const loc = places?.[0]?.location
          return loc ? { lat: loc.lat(), lng: loc.lng() } : null
        } catch { return null }
      }))
      if (cancelled) return

      const pts = resolved.filter((p): p is { lat: number; lng: number } => !!p)
      // Quita paradas consecutivas casi idénticas.
      const uniq = pts.filter((p, i) =>
        i === 0 || Math.abs(p.lat - pts[i - 1].lat) > 1e-4 || Math.abs(p.lng - pts[i - 1].lng) > 1e-4)
      if (uniq.length < 2) {
        toast.error('No se pudieron localizar las paradas del itinerario.')
        return
      }

      // 2) Ruta por carretera con coordenadas.
      const svc = new routesLib.DirectionsService()
      svc.route({
        origin: uniq[0],
        destination: uniq[uniq.length - 1],
        waypoints: uniq.slice(1, -1).map(location => ({ location, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
      }, (res, status) => {
        if (cancelled) return
        if (status === 'OK' && res) {
          renderer.setDirections(res)
        } else {
          // 3) Fallback: línea aproximada conectando las paradas.
          renderer.set('directions', null)
          polyline = new google.maps.Polyline({
            path: uniq, map,
            strokeColor: '#bf4d22', strokeWeight: 4, strokeOpacity: 0.85,
          })
          const bounds = new google.maps.LatLngBounds()
          uniq.forEach(p => bounds.extend(p))
          map.fitBounds(bounds, 56)
          toast.info('Mostrando ruta aproximada (no hay ruta por carretera entre todas las paradas).')
        }
      })
    })()

    return () => { cancelled = true; polyline?.setMap(null) }
  }, [routesLib, placesLib, renderer, map, stops])

  return null
}

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  rating?: number
  geometry: { location: { lat: () => number; lng: () => number } }
  types: string[]
  photos?: { getUrl(opts: { maxWidth: number }): string }[]
  website?: string
  url?: string
}

// Forma normalizada para añadir al itinerario, válida tanto para un
// favorito guardado como para un resultado de búsqueda.
interface PendingPlace {
  name: string
  address: string | null
  link: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
}

interface AddToItineraryState {
  place: PendingPlace
  open: boolean
}

// Selección activa en el mapa: un único concepto para lugar buscado, favorito
// o parada del itinerario → una sola tarjeta inferior coherente.
type MapSelection =
  | { kind: 'place'; place: PlaceResult }
  | { kind: 'favorite'; favorite: FavoritePlace }
  | { kind: 'stop'; stop: RoutePoint }

export function MapViewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId!)
  const { data: favorites } = useFavoritePlaces(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: activities } = useActivities(tripId!)
  const saveFavorite = useSaveFavoritePlace()
  const deleteFavorite = useDeleteFavoritePlace()
  const createActivity = useCreateActivity()
  const upsertDays = useUpsertDays()

  // Auto-genera los días del viaje si aún no existen (igual que la página
  // de Itinerario), para que el desplegable de día tenga opciones.
  useEffect(() => {
    if (!trip || !days || days.length > 0) return
    const range = eachDayOfInterval({ start: parseISO(trip.start_date), end: parseISO(trip.end_date) })
    upsertDays.mutate(range.map(d => ({ trip_id: trip.id, date: format(d, 'yyyy-MM-dd'), notes: null })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, days])

  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([])
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const [addToItineraryState, setAddToItineraryState] = useState<AddToItineraryState | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const [showRoute, setShowRoute] = useState(searchParams.get('route') === '1')


  // Google Maps cachea el tamaño del contenedor al inicializarse; si el
  // layout aún no estaba asentado, el mapa queda "encogido" en una esquina.
  // Empujón de resize al estar listo (y otro tras las animaciones).
  useEffect(() => {
    if (!mapInstance) return
    const kick = () => {
      const c = mapInstance.getCenter()
      google.maps.event.trigger(mapInstance, 'resize')
      if (c) mapInstance.setCenter(c)
    }
    const t1 = setTimeout(kick, 60)
    const t2 = setTimeout(kick, 400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [mapInstance])

  const routePoints = useMemo(
    () => buildRoutePoints(activities ?? [], days ?? []),
    [activities, days],
  )
  // Paradas con coordenadas guardadas: se pintan siempre como pines numerados.
  const placedPoints = useMemo(
    () => routePoints.filter(p => p.lat != null && p.lng != null),
    [routePoints],
  )
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  // Una sola comprobación al montar: condiciona controles del mapa y gestos.
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  // Para arrastrar la hoja inferior hacia abajo y cerrarla (solo desde el asa).
  const dragControls = useDragControls()

  // Filtro por día del itinerario: en viajes largos el mapa se llena de
  // paradas; permite ver solo las de un día (y su tramo de ruta).
  const [dayFilter, setDayFilter] = useState<string>('all')
  // Destino para el selector "Cómo llegar" (Google/Apple/Waze).
  const [directionsTo, setDirectionsTo] = useState<{ lat: number; lng: number; name: string } | null>(null)

  // Chips de día: solo los días que tienen alguna parada localizada, en orden.
  const dayChips = useMemo(() => {
    const order = new globalThis.Map<string, number>((days ?? []).map((d, i) => [d.date, i]))
    const dates = Array.from(new Set(placedPoints.map(p => p.date).filter(Boolean)))
    return dates
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(date => ({ date, n: (order.get(date) ?? 0) + 1 }))
  }, [placedPoints, days])

  const visiblePoints = useMemo(
    () => (dayFilter === 'all' ? placedPoints : placedPoints.filter(p => p.date === dayFilter)),
    [placedPoints, dayFilter],
  )
  const routeStops = useMemo(
    () => (dayFilter === 'all' ? routePoints : routePoints.filter(p => p.date === dayFilter)),
    [routePoints, dayFilter],
  )

  // En iOS/macOS ofrecemos Apple Maps; Google Maps y Waze siempre.
  const isApple = typeof navigator !== 'undefined' && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent)
  const navApps = directionsTo
    ? [
        { name: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${directionsTo.lat},${directionsTo.lng}`, show: true },
        { name: 'Apple Maps', href: `https://maps.apple.com/?daddr=${directionsTo.lat},${directionsTo.lng}&dirflg=d`, show: isApple },
        { name: 'Waze', href: `https://waze.com/ul?ll=${directionsTo.lat},${directionsTo.lng}&navigate=yes`, show: true },
      ].filter(a => a.show)
    : []

  function locateMe() {
    if (!('geolocation' in navigator)) { toast.error('Tu navegador no soporta geolocalización'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyPos(p)
        mapInstance?.panTo(p)
        mapInstance?.setZoom(15)
        setLocating(false)
      },
      () => { toast.error('No se pudo obtener tu ubicación'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Si llegamos con ?route=1 (desde el itinerario), mostramos la ruta y limpiamos el query.
  useEffect(() => {
    if (searchParams.get('route') === '1') {
      setShowRoute(true)
      searchParams.delete('route')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const searchPlaces = useCallback(async () => {
    const q = searchInput.trim()
    if (!q) return
    if (typeof google === 'undefined' || !google.maps?.places) {
      toast.error('El mapa todavía se está cargando. Inténtalo en un momento.')
      return
    }
    const center = mapInstance?.getCenter() ?? undefined
    setSearching(true)

    // Mapea un Place de la API nueva al shape que usa el resto del componente.
    const fromNew = (p: google.maps.places.Place): PlaceResult => ({
      place_id: p.id,
      name: p.displayName ?? '',
      formatted_address: p.formattedAddress ?? '',
      rating: p.rating ?? undefined,
      geometry: { location: { lat: () => p.location!.lat(), lng: () => p.location!.lng() } },
      types: p.types ?? [],
      website: p.websiteURI ?? undefined,
      url: p.googleMapsURI ?? undefined,
    })

    // Pinta los resultados y centra el mapa en ellos.
    const applyResults = (rs: PlaceResult[]) => {
      setSearchResults(rs)
      setSelected(rs.length === 1 ? { kind: 'place', place: rs[0] } : null)
      if (!mapInstance || !rs.length) return
      if (rs.length === 1) {
        mapInstance.panTo({ lat: rs[0].geometry.location.lat(), lng: rs[0].geometry.location.lng() })
        mapInstance.setZoom(15)
      } else {
        const bounds = new google.maps.LatLngBounds()
        rs.forEach(r => bounds.extend({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng() }))
        mapInstance.fitBounds(bounds, 64)
      }
    }

    // 1) Places API (New)
    try {
      if (google.maps.places.Place?.searchByText) {
        const { places } = await google.maps.places.Place.searchByText({
          textQuery: q,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'types', 'websiteURI', 'googleMapsURI'],
          maxResultCount: 12,
          ...(center ? { locationBias: center } : {}),
        })
        if (places?.length) {
          applyResults(places.filter(p => p.location).map(fromNew))
          setSearching(false)
          return
        }
      }
    } catch (e) {
      console.warn('[map] Place.searchByText no disponible, pruebo legacy:', e)
    }

    // 2) Fallback: PlacesService.textSearch (API legacy)
    try {
      const service = new google.maps.places.PlacesService(mapInstance ?? document.createElement('div'))
      service.textSearch(
        { query: q, ...(center ? { location: center, radius: 50000 } : {}) },
        (results, status) => {
          setSearching(false)
          const S = google.maps.places.PlacesServiceStatus
          if (status === S.OK && results?.length) {
            applyResults(results as unknown as PlaceResult[])
          } else if (status === S.ZERO_RESULTS) {
            setSearchResults([])
            toast.info('Sin resultados para esa búsqueda')
          } else {
            setSearchResults([])
            toast.error(`No se pudo buscar (${status}). Revisa que la "Places API" esté activada en Google Cloud.`)
          }
        }
      )
    } catch (e) {
      console.error('[map] textSearch error:', e)
      toast.error('No se pudo buscar lugares')
      setSearching(false)
    }
  }, [searchInput, mapInstance])

  // Selecciona un resultado y centra el mapa en él.
  const selectPlace = useCallback((place: PlaceResult) => {
    setSelected({ kind: 'place', place })
    setPanelOpen(false) // en móvil, cierra la hoja para ver el mapa
    if (mapInstance) {
      mapInstance.panTo({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
      mapInstance.setZoom(16)
    }
  }, [mapInstance])

  // Selecciona un favorito o una parada y centra el mapa en él.
  const selectFavorite = useCallback((favorite: FavoritePlace) => {
    setSelected({ kind: 'favorite', favorite })
    setPanelOpen(false)
    mapInstance?.panTo({ lat: favorite.lat, lng: favorite.lng })
  }, [mapInstance])

  const selectStop = useCallback((stop: RoutePoint) => {
    if (stop.lat == null || stop.lng == null) return
    setSelected({ kind: 'stop', stop })
    mapInstance?.panTo({ lat: stop.lat, lng: stop.lng })
  }, [mapInstance])

  // Foco automático en el buscador al abrir la hoja en móvil (sale el teclado).
  useEffect(() => {
    if (panelOpen && isMobile) setTimeout(() => searchRef.current?.focus(), 250)
  }, [panelOpen, isMobile])

  // Al abrir el mapa, orienta al usuario UNA vez: encuadra todas sus paradas y
  // favoritos; si no tiene ninguno, centra en el destino del viaje (geocodificado).
  const fittedRef = useRef(false)
  useEffect(() => {
    if (!mapInstance || fittedRef.current) return
    if (favorites === undefined || activities === undefined) return // datos aún cargando
    fittedRef.current = true
    const pts = [
      ...placedPoints.map(p => ({ lat: p.lat!, lng: p.lng! })),
      ...(favorites ?? []).map(f => ({ lat: f.lat, lng: f.lng })),
    ]
    if (pts.length === 1) {
      mapInstance.setCenter(pts[0]); mapInstance.setZoom(14)
    } else if (pts.length > 1) {
      const bounds = new google.maps.LatLngBounds()
      pts.forEach(p => bounds.extend(p))
      mapInstance.fitBounds(bounds, 64)
    } else if (trip?.destination) {
      new google.maps.Geocoder().geocode({ address: trip.destination }, (res, status) => {
        if (status === 'OK' && res?.[0]) {
          mapInstance.panTo(res[0].geometry.location)
          mapInstance.setZoom(12)
        }
      })
    }
  }, [mapInstance, favorites, activities, placedPoints, trip])

  async function handleSaveFavorite(place: PlaceResult) {
    if (!tripId) return
    const cat = placeTypeToCategory(place.types)
    await saveFavorite.mutateAsync({
      trip_id: tripId,
      google_place_id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      category: cat,
      rating: place.rating ?? null,
      notes: null,
      link: place.url ?? null,
    })
    setSelected(null)
    setSearchResults([])
    setSearchInput('')
  }

  async function handleAddToItinerary() {
    if (!addToItineraryState || !selectedDate) return
    const dayId = days?.find(d => d.date === selectedDate)?.id
    if (!dayId) { toast.error('Esa fecha no está dentro del viaje'); return }
    const { place } = addToItineraryState
    await createActivity.mutateAsync({
      trip_id: tripId!,
      day_id: dayId,
      type: 'place',
      title: place.name,
      address: place.address ?? null,
      start_time: selectedTime || null,
      end_time: null,
      description: null,
      price: null,
      external_link: place.link ?? null,
      notes: null,
      order_index: 0,
      place_id: place.place_id,
      origin: null,
      destination: null,
      lat: place.lat,
      lng: place.lng,
      origin_lat: null,
      origin_lng: null,
      destination_lat: null,
      destination_lng: null,
    })
    setAddToItineraryState(null)
    setSelectedDate('')
    setSelectedTime('')
    toast.success('Añadido al itinerario')
  }

  const filteredFavorites = favorites?.filter(f =>
    categoryFilter === 'all' || f.category === categoryFilter
  )

  const mapCenter = favorites && favorites.length > 0
    ? { lat: favorites[0].lat, lng: favorites[0].lng }
    : { lat: 40.4168, lng: -3.7038 }

  if (!API_KEY) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <MapPin size={48} className="mx-auto mb-4" style={{ color: 'var(--primary)' }} />
          <h2 className="font-serif text-2xl mb-2">API Key de Google Maps no configurada</h2>
          <p className="text-muted-foreground text-sm">
            Añade <code className="bg-surface-2 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> a tu archivo <code>.env</code>
          </p>
        </div>
      </div>
    )
  }

  // Contenido del panel, compartido por el sidebar de escritorio y la hoja móvil.
  const panelContent = (
    <>
      {/* Búsqueda */}
      <div className="p-4 space-y-3 border-b border-border shrink-0">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          <Link to="/dashboard" className="hover:text-foreground transition-colors">Viajes</Link>
          <span className="opacity-50">›</span>
          <Link to={`/trips/${tripId}`} className="hover:text-foreground transition-colors truncate max-w-[110px]">
            {trip?.name ?? '…'}
          </Link>
          <span className="opacity-50">›</span>
          <span className="text-foreground font-medium">Mapa</span>
        </nav>
        {/* Buscador con la lupa dentro del campo (clic = buscar) */}
        <div className="relative">
          <button
            onClick={searchPlaces}
            disabled={searching}
            title="Buscar"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-100"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          </button>
          <Input
            ref={searchRef}
            placeholder="Buscar lugares..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchPlaces()}
            className="pl-9 text-base md:text-sm"
          />
        </div>

        {/* Ver/ocultar el recorrido del itinerario en el mapa */}
        {routePoints.length >= 2 && (
          <Button
            variant={showRoute ? 'default' : 'outline'}
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => { const nv = !showRoute; setShowRoute(nv); if (nv) setPanelOpen(false) }}
            style={showRoute ? { background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' } : undefined}
          >
            <Route size={14} /> {showRoute ? 'Ocultar recorrido' : 'Ver recorrido del viaje'}
          </Button>
        )}
      </div>

      {/* Resultados de búsqueda: ocupan toda la hoja y scrollean (en móvil
          esto evita que solo se vean 3 resultados sin scroll). */}
      {searchResults.length > 0 ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
            <span className="text-xs text-muted-foreground">{searchResults.length} resultados</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setSearchResults([])}>
              <X size={12} /> Limpiar
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="pb-4">
              {searchResults.map(place => (
                <button
                  key={place.place_id}
                  onClick={() => selectPlace(place)}
                  className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border/50 last:border-0"
                >
                  <p className="text-sm font-medium line-clamp-1">{place.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{place.formatted_address}</p>
                  {place.rating && (
                    <p className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--primary)' }}>
                      <Star size={10} fill="var(--primary)" />
                      {place.rating}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : showRoute ? (
        /* Paradas del recorrido del itinerario */
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-border sticky top-0 z-10" style={{ background: 'var(--sidebar)' }}>
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Recorrido · {routeStops.length} paradas
            </span>
          </div>
          <ol className="pb-4">
            {routeStops.map((p, i) => (
              <li key={p.key} className="flex items-start gap-3 px-4 py-3 border-b border-border/30">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">
                    {p.label}{p.kind === 'origin' ? ' · salida' : p.kind === 'destination' ? ' · llegada' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{p.location}</p>
                  {p.date && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {format(parseISO(p.date), 'EEE dd MMM', { locale: es })}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </ScrollArea>
      ) : (
        <>
          {/* Filtro categorías */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCategoryFilter('all')}
                className="text-xs px-2.5 py-1 rounded-full border transition-all"
                style={{
                  borderColor: categoryFilter === 'all' ? 'var(--primary)' : 'var(--border)',
                  color: categoryFilter === 'all' ? 'var(--primary)' : 'var(--muted-foreground)',
                  background: categoryFilter === 'all' ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                }}
              >
                Todos
              </button>
              {Object.entries(PLACE_CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(k => k === key ? 'all' : key)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-all"
                  style={{
                    borderColor: categoryFilter === key ? PLACE_CATEGORY_COLORS[key] : 'var(--border)',
                    color: categoryFilter === key ? PLACE_CATEGORY_COLORS[key] : 'var(--muted-foreground)',
                    background: categoryFilter === key ? `${PLACE_CATEGORY_COLORS[key]}18` : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de favoritos */}
          <ScrollArea className="flex-1 min-h-0">
            {!filteredFavorites?.length ? (
              <div className="p-8 text-center">
                <Bookmark size={28} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Busca lugares y guárdalos como favoritos de este viaje
                </p>
              </div>
            ) : (
              <div className="pb-4">
                {Object.entries(PLACE_CATEGORY_LABELS).map(([cat, label]) => {
                  const items = filteredFavorites?.filter(f => f.category === cat) ?? []
                  if (!items.length) return null
                  return (
                    <div key={cat}>
                      <div className="px-4 py-2 sticky top-0 z-10" style={{ background: 'var(--sidebar)' }}>
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {label}
                        </span>
                      </div>
                      {items.map(place => (
                        <button
                          key={place.id}
                          onClick={() => selectFavorite(place)}
                          className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-1">{place.name}</p>
                              {place.address && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{place.address}</p>
                              )}
                              {place.rating && (
                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--primary)' }}>
                                  <Star size={9} fill="var(--primary)" />
                                  {place.rating}
                                </p>
                              )}
                            </div>
                            <div
                              className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                              style={{ background: getCategoryColor(place.category) }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </>
  )

  return (
    <APIProvider apiKey={API_KEY} libraries={['places']}>
      <div className="flex h-full relative">
        {/* Escritorio: barra lateral fija */}
        <div className="hidden md:flex md:flex-col md:w-80 md:border-r border-border" style={{ background: 'var(--sidebar)' }}>
          {panelContent}
        </div>

        {/* Móvil: hoja inferior arrastrable. Se cierra deslizando el asa hacia abajo. */}
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              className="md:hidden absolute inset-x-0 bottom-0 z-30 flex flex-col max-h-[80%] rounded-t-2xl border-t border-border shadow-2xl overflow-hidden"
              style={{ background: 'var(--sidebar)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 600) setPanelOpen(false)
              }}
            >
              {/* Asa: arrástrala hacia abajo (o tócala) para cerrar */}
              <div
                onPointerDown={(e) => dragControls.start(e)}
                onClick={() => setPanelOpen(false)}
                className="flex items-center justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
              >
                <span className="w-10 h-1.5 rounded-full" style={{ background: 'var(--border)' }} />
              </div>
              {panelContent}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mapa */}
        <div className="flex-1 relative">
          {/* Filtro por día (flotante, scroll horizontal en móvil) */}
          {dayChips.length >= 2 && (
            <div
              className="absolute top-3 left-3 right-3 z-10 flex gap-1.5 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {[{ date: 'all', n: 0 }, ...dayChips].map(({ date, n }) => {
                const active = dayFilter === date
                return (
                  <button
                    key={date}
                    onClick={() => { setDayFilter(date); setSelected(null) }}
                    className="text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 shadow-md transition-colors"
                    style={active
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                      : { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                  >
                    {date === 'all' ? 'Todos' : `Día ${n}`}
                  </button>
                )
              })}
            </div>
          )}
          <Map
            defaultCenter={mapCenter}
            defaultZoom={12}
            mapId="wanderlog-map"
            onIdle={(e) => setMapInstance(e.map)}
            colorScheme={ColorScheme.FOLLOW_SYSTEM}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl={!isMobile}
            className="w-full h-full"
          >
            {/* Recorrido del itinerario dibujado en el mapa (filtrado por día) */}
            {showRoute && routeStops.length >= 2 && <MapDirections key={dayFilter} stops={routeStops} />}

            {/* Paradas del itinerario con ubicación: pines numerados (del día filtrado).
                El icono es de 24px pero el área pulsable ronda los 44px (padding). */}
            {visiblePoints.map((p, i) => {
              const active = selected?.kind === 'stop' && selected.stop.key === p.key
              return (
                <AdvancedMarker
                  key={p.key}
                  position={{ lat: p.lat!, lng: p.lng! }}
                  zIndex={active ? 15 : 5}
                  onClick={() => selectStop(p)}
                >
                  <div className="p-2.5 cursor-pointer" title={p.label}>
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg text-[11px] font-bold text-white transition-transform',
                        active && 'scale-125 ring-2 ring-white',
                      )}
                      style={{ background: '#bf4d22' }}
                    >
                      {i + 1}
                    </div>
                  </div>
                </AdvancedMarker>
              )
            })}

            {/* Mi ubicación */}
            {myPos && (
              <AdvancedMarker position={myPos} zIndex={20}>
                <div className="relative">
                  <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(59,130,246,0.4)' }} />
                  <span className="block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: '#3b82f6' }} />
                </div>
              </AdvancedMarker>
            )}

            {/* Marcadores de favoritos */}
            {filteredFavorites?.map(place => {
              const active = selected?.kind === 'favorite' && selected.favorite.id === place.id
              return (
                <AdvancedMarker
                  key={place.id}
                  position={{ lat: place.lat, lng: place.lng }}
                  zIndex={active ? 15 : 2}
                  onClick={() => selectFavorite(place)}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full border-2 border-white flex items-center justify-center shadow-lg cursor-pointer transition-transform',
                      active ? 'scale-125 ring-2 ring-white' : 'hover:scale-110',
                    )}
                    style={{ background: getCategoryColor(place.category) }}
                    title={place.name}
                  >
                    <span className="text-xs">
                      {place.category === 'restaurant' ? '🍽️' :
                        place.category === 'hotel' ? '🏨' :
                          place.category === 'attraction' ? '🎯' :
                            place.category === 'cafe' ? '☕' :
                              place.category === 'bar' ? '🍺' :
                                place.category === 'shop' ? '🛍️' : '📍'}
                    </span>
                  </div>
                </AdvancedMarker>
              )
            })}

            {/* Marcadores de resultados de búsqueda */}
            {searchResults.map(place => {
              const isSel = selected?.kind === 'place' && selected.place.place_id === place.place_id
              return (
                <AdvancedMarker
                  key={place.place_id}
                  position={{
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                  }}
                  zIndex={isSel ? 10 : 1}
                  onClick={() => selectPlace(place)}
                >
                  <Pin
                    background={isSel ? '#bf4d22' : '#eaa285'}
                    glyphColor="#ffffff"
                    borderColor={isSel ? '#e0815a' : '#f3c8b2'}
                    scale={isSel ? 1.15 : 0.95}
                  />
                </AdvancedMarker>
              )
            })}

          </Map>

          {/* Botones flotantes: se ocultan si hay tarjeta de lugar abierta
              (en móvil la tarjeta ocupa la franja inferior y los tapaba). */}
          {!selected && (
            <>
              {/* Mi ubicación */}
              <Button
                size="icon"
                onClick={locateMe}
                disabled={locating}
                title="Dónde estoy"
                className="absolute bottom-20 right-4 md:bottom-6 z-10 rounded-full w-12 h-12 md:w-11 md:h-11 shadow-xl"
                style={{ background: 'var(--card)', color: 'var(--primary)', border: '1px solid var(--border)' }}
              >
                {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
              </Button>

              {/* Abrir lista/búsqueda (solo móvil) */}
              {!panelOpen && (
                <Button
                  onClick={() => setPanelOpen(true)}
                  className="md:hidden absolute bottom-20 left-4 z-10 gap-2 h-12 shadow-xl rounded-full"
                  style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                >
                  <List size={16} />
                  Buscar y lugares
                </Button>
              )}
            </>
          )}

          {/* Tarjeta inferior unificada: misma interacción para lugar buscado,
              favorito y parada del itinerario (cómoda al pulgar en móvil). */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 rounded-xl p-4 shadow-2xl z-20"
                style={{ background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
              >
                <button
                  onClick={() => { setSelected(null); if (selected.kind === 'place') setSearchResults([]) }}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>

                {/* Lugar buscado */}
                {selected.kind === 'place' && (() => {
                  const p = selected.place
                  const lat = p.geometry.location.lat(), lng = p.geometry.location.lng()
                  return (
                    <>
                      {p.photos?.[0] && (
                        <img src={p.photos[0].getUrl({ maxWidth: 400 })} alt={p.name} className="w-full h-28 object-cover rounded-lg mb-3" />
                      )}
                      <h3 className="font-serif text-lg font-medium pr-6">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{p.formatted_address}</p>
                      {p.rating && (
                        <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: 'var(--primary)' }}>
                          <Star size={11} fill="var(--primary)" /> {p.rating} / 5
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="flex-1 gap-1.5 text-xs" style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }} onClick={() => handleSaveFavorite(p)} disabled={saveFavorite.isPending}>
                          <Bookmark size={12} /> Favorito
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => setAddToItineraryState({ open: true, place: { name: p.name, address: p.formatted_address, link: p.url ?? null, place_id: null, lat, lng } })}>
                          <Calendar size={12} /> Itinerario
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" className="w-full mt-2 gap-1.5 text-xs" onClick={() => setDirectionsTo({ lat, lng, name: p.name })}>
                        <Navigation size={12} /> Cómo llegar
                      </Button>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink size={12} /> Ver en Google Maps
                        </a>
                      )}
                    </>
                  )
                })()}

                {/* Favorito guardado */}
                {selected.kind === 'favorite' && (() => {
                  const f = selected.favorite
                  return (
                    <>
                      <h3 className="font-serif text-lg font-medium pr-6">{f.name}</h3>
                      {f.address && <p className="text-xs text-muted-foreground mt-1">{f.address}</p>}
                      {f.rating && (
                        <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: 'var(--primary)' }}>
                          <Star size={11} fill="var(--primary)" /> {f.rating} / 5
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="flex-1 gap-1.5 text-xs" style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }} onClick={() => setAddToItineraryState({ open: true, place: { name: f.name, address: f.address, link: f.link, place_id: f.id, lat: f.lat, lng: f.lng } })}>
                          <Calendar size={12} /> Itinerario
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => setDirectionsTo({ lat: f.lat, lng: f.lng, name: f.name })}>
                          <Navigation size={12} /> Cómo llegar
                        </Button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {f.link && (
                          <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" asChild>
                            <a href={f.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Maps</a>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => { deleteFavorite.mutate({ id: f.id, tripId: tripId! }); setSelected(null) }}>
                          <X size={12} /> Quitar
                        </Button>
                      </div>
                    </>
                  )
                })()}

                {/* Parada del itinerario */}
                {selected.kind === 'stop' && (() => {
                  const s = selected.stop
                  return (
                    <>
                      <h3 className="font-serif text-lg font-medium pr-6">{s.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{s.location}</p>
                      {s.date && (
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize flex items-center gap-1">
                          <Calendar size={11} /> {format(parseISO(s.date), 'EEEE dd MMM', { locale: es })}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => s.lat != null && setDirectionsTo({ lat: s.lat, lng: s.lng!, name: s.label })}>
                          <Navigation size={12} /> Cómo llegar
                        </Button>
                        <Button size="sm" className="flex-1 gap-1.5 text-xs" style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }} asChild>
                          <Link to={`/trips/${tripId}/itinerary/${s.activityId}`}>
                            <Calendar size={12} /> Ver actividad
                          </Link>
                        </Button>
                      </div>
                    </>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal añadir al itinerario */}
      <Dialog
        open={addToItineraryState?.open ?? false}
        onOpenChange={() => setAddToItineraryState(null)}
      >
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif">Añadir al itinerario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {addToItineraryState?.place.name}
            </p>
            <div className="space-y-1.5">
              <Label>Día</Label>
              <DatePicker
                value={selectedDate}
                onChange={setSelectedDate}
                placeholder="Elige un día del viaje"
                fromDate={trip ? parseISO(trip.start_date) : undefined}
                toDate={trip ? parseISO(trip.end_date) : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hora (opcional)</Label>
              <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setAddToItineraryState(null)}>Cancelar</Button>
            <Button
              disabled={!selectedDate || createActivity.isPending}
              onClick={handleAddToItinerary}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
            >
              <Calendar size={14} className="mr-2" />
              Añadir al itinerario
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selector de app para "Cómo llegar" */}
      <Dialog open={!!directionsTo} onOpenChange={() => setDirectionsTo(null)}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Navigation size={18} style={{ color: 'var(--primary)' }} />
              Cómo llegar
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">{directionsTo?.name}</p>
          <div className="grid gap-2 py-2">
            {navApps.map(app => (
              <a
                key={app.name}
                href={app.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setDirectionsTo(null)}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:border-primary transition-colors"
                style={{ background: 'var(--secondary)' }}
              >
                <span className="text-sm font-medium">{app.name}</span>
                <ExternalLink size={14} className="text-muted-foreground" />
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Se abrirá la app si la tienes instalada; si no, en el navegador.</p>
        </DialogContent>
      </Dialog>
    </APIProvider>
  )
}
