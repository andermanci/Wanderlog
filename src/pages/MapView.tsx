import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { APIProvider, Map, AdvancedMarker, InfoWindow, Pin } from '@vis.gl/react-google-maps'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Star, MapPin, ExternalLink, Bookmark, X, Plus, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useFavoritePlaces, useSaveFavoritePlace, useDeleteFavoritePlace } from '@/lib/queries/places'
import { useCreateActivity } from '@/lib/queries/itinerary'
import { useItineraryDays } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { placeTypeToCategory, getCategoryColor, MAPS_DARK_STYLE } from '@/lib/maps'
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS, formatDate } from '@/lib/utils'
import type { FavoritePlace } from '@/types/database'
import { toast } from 'sonner'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

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

interface AddToItineraryState {
  place: FavoritePlace
  open: boolean
}

export function MapViewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId!)
  const { data: favorites } = useFavoritePlaces(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const saveFavorite = useSaveFavoritePlace()
  const deleteFavorite = useDeleteFavoritePlace()
  const createActivity = useCreateActivity()

  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([])
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null)
  const [selectedFavorite, setSelectedFavorite] = useState<FavoritePlace | null>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const [addToItineraryState, setAddToItineraryState] = useState<AddToItineraryState | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const searchPlaces = useCallback(() => {
    if (!mapInstance || !searchInput.trim()) return
    const service = new google.maps.places.PlacesService(mapInstance)
    service.textSearch(
      { query: searchInput, location: mapInstance.getCenter() ?? undefined },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setSearchResults(results as unknown as PlaceResult[])
        }
      }
    )
  }, [mapInstance, searchInput])

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
    setSelectedPlace(null)
    setSearchResults([])
    setSearchInput('')
  }

  async function handleAddToItinerary() {
    if (!addToItineraryState || !selectedDay) return
    const { place } = addToItineraryState
    await createActivity.mutateAsync({
      trip_id: tripId!,
      day_id: selectedDay,
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
      place_id: place.id,
    })
    setAddToItineraryState(null)
    setSelectedDay('')
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
          <MapPin size={48} className="mx-auto mb-4" style={{ color: '#c9a84c' }} />
          <h2 className="font-serif text-2xl mb-2">API Key de Google Maps no configurada</h2>
          <p className="text-muted-foreground text-sm">
            Añade <code className="bg-surface-2 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> a tu archivo <code>.env</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={API_KEY} libraries={['places']}>
      <div className="flex h-full">
        {/* Panel lateral */}
        <div className="w-80 flex flex-col border-r border-border" style={{ background: '#0d0d16' }}>
          {/* Búsqueda */}
          <div className="p-4 border-b border-border">
            <h2 className="font-serif text-xl mb-3">Mapa</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar lugares..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPlaces()}
                className="flex-1 text-sm"
              />
              <Button size="icon" variant="ghost" onClick={searchPlaces}>
                <Search size={16} />
              </Button>
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {searchResults.length > 0 && (
            <div className="border-b border-border">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-muted-foreground">{searchResults.length} resultados</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSearchResults([])}>
                  <X size={12} />
                </Button>
              </div>
              <ScrollArea className="max-h-52">
                {searchResults.map(place => (
                  <button
                    key={place.place_id}
                    onClick={() => setSelectedPlace(place)}
                    className="w-full text-left px-4 py-2.5 hover:bg-secondary transition-colors border-b border-border/50 last:border-0"
                  >
                    <p className="text-sm font-medium line-clamp-1">{place.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{place.formatted_address}</p>
                    {place.rating && (
                      <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#c9a84c' }}>
                        <Star size={10} fill="#c9a84c" />
                        {place.rating}
                      </p>
                    )}
                  </button>
                ))}
              </ScrollArea>
            </div>
          )}

          {/* Filtro categorías */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCategoryFilter('all')}
                className="text-xs px-2 py-0.5 rounded-full border transition-all"
                style={{
                  borderColor: categoryFilter === 'all' ? '#c9a84c' : '#2a2a3a',
                  color: categoryFilter === 'all' ? '#c9a84c' : '#a89b8a',
                  background: categoryFilter === 'all' ? 'rgba(201,168,76,0.1)' : 'transparent',
                }}
              >
                Todos
              </button>
              {Object.entries(PLACE_CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(k => k === key ? 'all' : key)}
                  className="text-xs px-2 py-0.5 rounded-full border transition-all"
                  style={{
                    borderColor: categoryFilter === key ? PLACE_CATEGORY_COLORS[key] : '#2a2a3a',
                    color: categoryFilter === key ? PLACE_CATEGORY_COLORS[key] : '#a89b8a',
                    background: categoryFilter === key ? `${PLACE_CATEGORY_COLORS[key]}18` : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de favoritos */}
          <ScrollArea className="flex-1">
            {!filteredFavorites?.length ? (
              <div className="p-6 text-center">
                <Bookmark size={28} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Busca lugares y guárdalos como favoritos de este viaje
                </p>
              </div>
            ) : (
              <div>
                {Object.entries(PLACE_CATEGORY_LABELS).map(([cat, label]) => {
                  const items = filteredFavorites?.filter(f => f.category === cat) ?? []
                  if (!items.length) return null
                  return (
                    <div key={cat}>
                      <div className="px-4 py-2 sticky top-0 z-10"
                        style={{ background: '#0d0d16' }}>
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {label}
                        </span>
                      </div>
                      {items.map(place => (
                        <button
                          key={place.id}
                          onClick={() => setSelectedFavorite(place)}
                          className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-1">{place.name}</p>
                              {place.address && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{place.address}</p>
                              )}
                              {place.rating && (
                                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#c9a84c' }}>
                                  <Star size={9} fill="#c9a84c" />
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
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">
          <Map
            defaultCenter={mapCenter}
            defaultZoom={12}
            mapId="wanderlog-map"
            onIdle={(e) => setMapInstance(e.map)}
            styles={MAPS_DARK_STYLE}
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* Marcadores de favoritos */}
            {filteredFavorites?.map(place => (
              <AdvancedMarker
                key={place.id}
                position={{ lat: place.lat, lng: place.lng }}
                onClick={() => setSelectedFavorite(place)}
              >
                <div
                  className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform"
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
            ))}

            {/* Marcador de lugar seleccionado en búsqueda */}
            {selectedPlace && (
              <AdvancedMarker
                position={{
                  lat: selectedPlace.geometry.location.lat(),
                  lng: selectedPlace.geometry.location.lng(),
                }}
              >
                <Pin background="#c9a84c" glyphColor="#0a0a0f" borderColor="#e4c97a" />
              </AdvancedMarker>
            )}

            {/* InfoWindow de favorito seleccionado */}
            {selectedFavorite && (
              <InfoWindow
                position={{ lat: selectedFavorite.lat, lng: selectedFavorite.lng }}
                onCloseClick={() => setSelectedFavorite(null)}
              >
                <div className="p-3 min-w-[200px]" style={{ background: '#12121a', borderRadius: '8px' }}>
                  <p className="font-medium text-sm mb-1">{selectedFavorite.name}</p>
                  {selectedFavorite.address && (
                    <p className="text-xs text-gray-400 mb-2">{selectedFavorite.address}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setAddToItineraryState({ place: selectedFavorite, open: true })}
                      className="text-xs px-2 py-1 rounded flex items-center gap-1"
                      style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c' }}
                    >
                      <Plus size={10} />
                      Itinerario
                    </button>
                    {selectedFavorite.link && (
                      <a
                        href={selectedFavorite.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded flex items-center gap-1 text-gray-300 hover:text-white"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        <ExternalLink size={10} />
                        Maps
                      </a>
                    )}
                    <button
                      onClick={() => deleteFavorite.mutate({ id: selectedFavorite.id, tripId: tripId! })}
                      className="text-xs px-2 py-1 rounded text-red-400 hover:text-red-300"
                      style={{ background: 'rgba(255,0,0,0.08)' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>

          {/* Panel de lugar desde búsqueda */}
          <AnimatePresence>
            {selectedPlace && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-80 rounded-xl p-4 shadow-2xl"
                style={{ background: '#12121a', border: '1px solid rgba(201,168,76,0.2)' }}
              >
                <button
                  onClick={() => { setSelectedPlace(null); setSearchResults([]) }}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
                {selectedPlace.photos?.[0] && (
                  <img
                    src={selectedPlace.photos[0].getUrl({ maxWidth: 400 })}
                    alt={selectedPlace.name}
                    className="w-full h-28 object-cover rounded-lg mb-3"
                  />
                )}
                <h3 className="font-serif text-lg font-medium pr-6">{selectedPlace.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedPlace.formatted_address}</p>
                {selectedPlace.rating && (
                  <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: '#c9a84c' }}>
                    <Star size={11} fill="#c9a84c" />
                    {selectedPlace.rating} / 5
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}
                    onClick={() => handleSaveFavorite(selectedPlace)}
                    disabled={saveFavorite.isPending}
                  >
                    <Bookmark size={12} />
                    Guardar favorito
                  </Button>
                  {selectedPlace.url && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs" asChild>
                      <a href={selectedPlace.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} />
                        Google Maps
                      </a>
                    </Button>
                  )}
                </div>
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
        <DialogContent style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
          <DialogHeader>
            <DialogTitle className="font-serif">Añadir al itinerario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {addToItineraryState?.place.name}
            </p>
            <div className="space-y-1.5">
              <Label>Día</Label>
              <Select value={selectedDay} onValueChange={setSelectedDay}>
                <SelectTrigger><SelectValue placeholder="Seleccionar día..." /></SelectTrigger>
                <SelectContent>
                  {days?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{formatDate(d.date, 'EEEE, dd MMM yyyy')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hora (opcional)</Label>
              <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setAddToItineraryState(null)}>Cancelar</Button>
            <Button
              disabled={!selectedDay || createActivity.isPending}
              onClick={handleAddToItinerary}
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}
            >
              <Calendar size={14} className="mr-2" />
              Añadir al itinerario
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </APIProvider>
  )
}
