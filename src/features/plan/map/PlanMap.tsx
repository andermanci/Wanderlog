import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AdvancedMarker, ColorScheme, ControlPosition, Map as GoogleMap, useMap } from '@vis.gl/react-google-maps'
import {
  Bookmark, BookmarkCheck, CalendarPlus, Car, Copy, ExternalLink, Eye, Footprints, Layers, LocateFixed,
  MapPin, MapPinOff, Navigation, Pencil, Route, Search, Star, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ActivityIcon, Badge, Button, Chip, Confirm, Empty, IconButton, Input, Menu, PlaceIcon, Segmented, SwitchRow, useIsMobile,
} from '@/design'
import { DirectionsPanel } from '@/features/common/Directions'
import { useDeleteFavoritePlace, useFavoritePlaces } from '@/lib/queries/places'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { useTrip } from '@/lib/queries/trips'
import { geocodeQueryOptions } from '@/lib/geocode'
import { placeTypeToCategory } from '@/lib/maps'
import type { DirectionsTarget } from '@/lib/directions'
import type { RoutePoint } from '@/lib/route'
import { useMyLocation } from '@/hooks/useMyLocation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cn, formatDate, PLACE_CATEGORY_LABELS } from '@/lib/utils'
import type { FavoritePlace } from '@/types/database'
import { usePlanStore } from '../planStore'
import { AddToPlanPanel, type PendingPlace } from '../ideas/AddToPlanPanel'
import { PlaceEditPanel } from '../ideas/PlaceEditPanel'
import { collectionsOf, copyAddress, openLink, pendingFromFavorite } from '../ideas/places'
import { MapDirections } from './MapDirections'
import { OfflineStops } from './OfflineStops'
import { SavePlacePanel } from './SavePlacePanel'
import { SelectionCard } from './SelectionCard'
import { FavoritePin, MyLocationDot, ResultPin, StopPin } from './pins'
import { DayPath } from './DayPath'
import { DayStrip, type DayStop } from './DayStrip'
import { useToneHex } from './tone'
import { useMapSearch } from './useMapSearch'
import { useRouteLayer } from './useRouteLayer'
import type { MapSelection, PlaceResult, TravelMode } from './types'

const MAP_ID = 'plan-map'
const HAS_MAPS_KEY = !!import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY

// Última petición de «enséñame esto en el mapa» ya atendida. Vive fuera del
// componente porque en móvil el mapa se desmonta al cambiar de vista: al volver
// no debe repetir una petición vieja que sigue en el store.
let lastHandledFocus = 0

/**
 * El mapa del Plan: paradas numeradas y su recorrido, lugares guardados,
 * buscador de sitios y «mi ubicación». Rellena su contenedor.
 * Necesita un <APIProvider> ancestro (lo pone la pantalla del Plan).
 */
export function PlanMap({ tripId }: { tripId: string }) {
  const online = useOnlineStatus()
  return (
    <div className="relative h-full w-full">
      {!online ? <OfflineStops tripId={tripId} />
        : HAS_MAPS_KEY ? <LiveMap tripId={tripId} />
          : (
            <div className="grid h-full place-items-center bg-background p-4">
              <Empty icon={MapPinOff} title="El mapa no está disponible" description="Falta la clave de Google Maps en la configuración de la app, así que ahora no se puede cargar el mapa." />
            </div>
          )}
    </div>
  )
}

function LiveMap({ tripId }: { tripId: string }) {
  const map = useMap(MAP_ID)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: trip } = useTrip(tripId)
  const { data: favorites } = useFavoritePlaces(tripId)
  const { data: role } = useTripRole(tripId)
  const canEdit = canEditRole(role)
  const deleteFavorite = useDeleteFavoritePlace()
  const routeColor = useToneHex('primary')

  const hoveredActivityId = usePlanStore(s => s.hoveredActivityId)
  const setHoveredActivity = usePlanStore(s => s.setHoveredActivity)
  const focus = usePlanStore(s => s.focus)
  const focusOnMap = usePlanStore(s => s.focusOnMap)

  const {
    activities, routePoints, placedPoints, visiblePoints, routeStops,
    setMapDay, dayDate, dayChips, showRoute, setShowRoute, showTripRoute, travelMode, setTravelMode,
  } = useRouteLayer(tripId, !!map, canEdit)

  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [collectionFilter, setCollectionFilter] = useState('all')
  // Capas del mapa: lugares guardados y paradas del plan.
  const [showFavs, setShowFavs] = useState(true)
  const [showStops, setShowStops] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  // Paneles: de uno en uno, y siempre desde la tarjeta.
  const [saving, setSaving] = useState<PlaceResult | null>(null)
  const [adding, setAdding] = useState<PendingPlace | null>(null)
  const [editing, setEditing] = useState<FavoritePlace | null>(null)
  const [removing, setRemoving] = useState<FavoritePlace | null>(null)
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)

  const activityById = useMemo(() => new globalThis.Map((activities ?? []).map(a => [a.id, a])), [activities])
  // Con un día elegido, cada parada con su actividad y su hora (la de llegada si
  // es el destino de un trayecto): de aquí salen las etiquetas de los pines y la
  // agenda de abajo.
  const dayView = dayDate !== 'all'
  const dayStops = useMemo((): DayStop[] => visiblePoints.map(point => {
    const activity = activityById.get(point.activityId)
    const t = point.kind === 'destination' ? activity?.end_time : activity?.start_time
    return { point, activity, time: t ? t.slice(0, 5) : null }
  }), [visiblePoints, activityById])
  const collections = useMemo(() => collectionsOf(favorites), [favorites])
  const categories = useMemo(() => {
    const present = new Set((favorites ?? []).map(f => f.category as string))
    return Object.keys(PLACE_CATEGORY_LABELS).filter(c => present.has(c))
  }, [favorites])
  const filteredFavorites = useMemo(() => (favorites ?? []).filter(f =>
    (categoryFilter === 'all' || f.category === categoryFilter)
    && (collectionFilter === 'all' || (f.collection?.trim() || '') === collectionFilter)),
  [favorites, categoryFilter, collectionFilter])
  const activeFilters = Number(categoryFilter !== 'all') + Number(collectionFilter !== 'all') + Number(!showFavs) + Number(!showStops)

  // ── Buscador ────────────────────────────────────────────────────────────
  // Pinta los resultados y centra el mapa en ellos.
  const applyResults = useCallback((rs: PlaceResult[]) => {
    setSelection(rs.length === 1 ? { kind: 'result', id: rs[0].place_id } : null)
    if (!map || !rs.length) return
    if (rs.length === 1) {
      map.panTo({ lat: rs[0].lat, lng: rs[0].lng })
      map.setZoom(15)
    } else {
      const bounds = new google.maps.LatLngBounds()
      rs.forEach(r => bounds.extend({ lat: r.lat, lng: r.lng }))
      map.fitBounds(bounds, 64)
    }
  }, [map])
  const {
    input: searchInput, setInput: setSearchInput, results, searching,
    search: runSearch, clear: resetSearch, inputRef: searchInputRef,
  } = useMapSearch(map, applyResults)

  // ── Selección ───────────────────────────────────────────────────────────
  const selectedResult = selection?.kind === 'result' ? results.find(r => r.place_id === selection.id) : undefined
  const selectedFavorite = selection?.kind === 'favorite' ? favorites?.find(f => f.id === selection.id) : undefined
  const selectedStop = selection?.kind === 'stop' ? placedPoints.find(p => p.key === selection.key) : undefined
  const hasCard = !!(selectedResult || selectedFavorite || selectedStop)

  const selectResult = useCallback((place: PlaceResult) => {
    setSelection({ kind: 'result', id: place.place_id })
    map?.panTo({ lat: place.lat, lng: place.lng })
    map?.setZoom(16)
  }, [map])

  const selectFavorite = useCallback((favorite: FavoritePlace) => {
    setSelection({ kind: 'favorite', id: favorite.id })
    map?.panTo({ lat: favorite.lat, lng: favorite.lng })
  }, [map])

  const selectStop = useCallback((stop: RoutePoint) => {
    if (stop.lat == null || stop.lng == null) return
    setSelection({ kind: 'stop', key: stop.key })
    if (map) {
      map.panTo({ lat: stop.lat, lng: stop.lng })
      if ((map.getZoom() ?? 0) < 14) map.setZoom(15)
    }
  }, [map])

  // ── Encuadre ────────────────────────────────────────────────────────────
  // Google Maps cachea el tamaño del contenedor al inicializarse; si el layout
  // aún no estaba asentado (o cambia: se abre un panel, gira el móvil), el mapa
  // queda «encogido». Empujón de resize al estar listo y cuando cambia de tamaño.
  useEffect(() => {
    if (!map) return
    const kick = () => {
      const c = map.getCenter()
      google.maps.event.trigger(map, 'resize')
      if (c) map.setCenter(c)
    }
    const t1 = setTimeout(kick, 60)
    const t2 = setTimeout(kick, 400)
    const ro = new ResizeObserver(() => google.maps.event.trigger(map, 'resize'))
    ro.observe(map.getDiv())
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect() }
  }, [map])

  // Encuadra lo que se ve: las paradas del día elegido o, con «Todo», todas las
  // paradas y los lugares guardados. Si no hay nada, centra en el destino.
  const fitVisible = useCallback(() => {
    if (!map) return
    const stopsPts = visiblePoints.map(p => ({ lat: p.lat!, lng: p.lng! }))
    const pts = dayDate !== 'all' && stopsPts.length > 0
      ? stopsPts
      : [
        ...placedPoints.map(p => ({ lat: p.lat!, lng: p.lng! })),
        ...(favorites ?? []).map(f => ({ lat: f.lat, lng: f.lng })),
      ]
    if (pts.length === 1) {
      map.setCenter(pts[0])
      map.setZoom(14)
    } else if (pts.length > 1) {
      const bounds = new google.maps.LatLngBounds()
      pts.forEach(p => bounds.extend(p))
      // Arriba van el buscador y los chips; abajo, con un día elegido, su agenda.
      map.fitBounds(bounds, { top: 130, bottom: dayDate !== 'all' ? 200 : 64, left: 48, right: 48 })
    } else if (trip?.destination) {
      // Vía caché: el destino de un viaje se geocodifica una vez, no en cada
      // apertura del mapa.
      qc.fetchQuery(geocodeQueryOptions(trip.destination)).then(coords => {
        if (!coords) return
        map.panTo(coords)
        map.setZoom(12)
      }).catch(() => { /* sin centrado automático */ })
    }
  }, [map, visiblePoints, placedPoints, favorites, dayDate, trip, qc])

  // Parámetros de URL heredados, al montar o cuando lleguen: `?focus=<actividad>`
  // y `?place=<lugar>` centran y abren su tarjeta; `?route=1` dibuja el recorrido
  // de todo el viaje; `?buscar=1` lleva el cursor al buscador. Se consumen y se
  // quitan de la URL sin tocar el resto.
  useEffect(() => {
    const focusId = searchParams.get('focus')
    const placeId = searchParams.get('place')
    const wantsRoute = searchParams.get('route') === '1'
    const wantsSearch = searchParams.get('buscar') === '1'
    if (!focusId && !placeId && !wantsRoute && !wantsSearch) return
    if (focusId) focusOnMap({ kind: 'activity', id: focusId })
    else if (placeId) focusOnMap({ kind: 'place', id: placeId })
    if (wantsRoute) showTripRoute()
    if (wantsSearch) searchInputRef.current?.focus()
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const k of ['focus', 'place', 'route', 'buscar']) next.delete(k)
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la URL
  }, [searchParams])

  // Al abrir el mapa, orienta UNA vez (salvo que haya una petición de foco
  // pendiente: entonces manda ella).
  const dataReady = favorites !== undefined && activities !== undefined
  const fittedRef = useRef(false)
  const fittedDayRef = useRef(dayDate)
  useEffect(() => {
    if (!map || !dataReady || fittedRef.current) return
    fittedRef.current = true
    fittedDayRef.current = dayDate
    const pending = usePlanStore.getState().focus
    if (pending && pending.nonce > lastHandledFocus) return
    fitVisible()
  }, [map, dataReady, dayDate, fitVisible])

  // Al cambiar de día (desde la lista o desde los chips), encuadra sus paradas.
  // Con una tarjeta abierta no se mueve el mapa: se está mirando ese sitio.
  useEffect(() => {
    if (!map || !fittedRef.current || fittedDayRef.current === dayDate) return
    fittedDayRef.current = dayDate
    if (!selection) fitVisible()
  }, [map, dayDate, selection, fitVisible])

  // Petición de foco (desde la lista de días, las ideas o la URL): centra el
  // mapa en esa actividad o lugar y abre su tarjeta.
  useEffect(() => {
    if (!focus || focus.nonce <= lastHandledFocus || !map || !dataReady) return
    lastHandledFocus = focus.nonce
    /* eslint-disable react-hooks/set-state-in-effect -- responde a una orden externa (store compartido con la lista) */
    if (focus.kind === 'activity') {
      const stop = placedPoints.find(p => p.activityId === focus.id)
      if (!stop) {
        toast.info('Esa actividad no tiene una ubicación que enseñar en el mapa.')
        return
      }
      // Que el filtro de día o la capa apagada no escondan su pin.
      if (!visiblePoints.includes(stop)) setMapDay('all')
      setShowStops(true)
      selectStop(stop)
    } else {
      const fav = favorites?.find(f => f.id === focus.id)
      if (!fav) {
        toast.info('Ese lugar ya no está entre los guardados.')
        return
      }
      setShowFavs(true)
      setCategoryFilter('all')
      setCollectionFilter('all')
      selectFavorite(fav)
      if ((map.getZoom() ?? 0) < 14) map.setZoom(15)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [focus, map, dataReady, placedPoints, visiblePoints, favorites, setMapDay, selectStop, selectFavorite])

  // ── Mi ubicación ────────────────────────────────────────────────────────
  // El mapa recentra en cada posición nueva salvo que se haya arrastrado a mano.
  const userMovedRef = useRef(false)
  const location = useMyLocation((pos, first) => {
    if (first) {
      map?.panTo(pos)
      map?.setZoom(16)
    } else if (!userMovedRef.current) {
      map?.panTo(pos)
    }
  })
  useEffect(() => {
    if (!map) return
    const l = map.addListener('dragstart', () => { userMovedRef.current = true })
    return () => l.remove()
  }, [map])
  function toggleLocation() {
    userMovedRef.current = false
    location.toggle()
  }

  // ── Acciones de la tarjeta ──────────────────────────────────────────────
  function clearSearch() {
    resetSearch()
    if (selection?.kind === 'result') setSelection(null)
  }

  const showResultsList = results.length > 0 && !hasCard
  const canDrawRoute = routeStops.length >= 2
  const showDayStrip = dayView && showStops && !hasCard && !showResultsList && dayStops.length > 0
  const mapCenter = favorites && favorites.length > 0
    ? { lat: favorites[0].lat, lng: favorites[0].lng }
    : { lat: 40.4168, lng: -3.7038 }

  return (
    <>
      <GoogleMap
        id={MAP_ID}
        mapId="wanderlog-map"
        defaultCenter={mapCenter}
        defaultZoom={12}
        colorScheme={ColorScheme.FOLLOW_SYSTEM}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl={!isMobile}
        zoomControlOptions={{ position: ControlPosition.RIGHT_CENTER }}
        onClick={() => setLayersOpen(false)}
        className="h-full w-full"
      >
        {/* Recorrido del plan (del día elegido o de todo el viaje) */}
        {showRoute && canDrawRoute && (
          <MapDirections key={`${dayDate}-${travelMode}`} mapId={MAP_ID} stops={routeStops} mode={travelMode} color={routeColor} />
        )}

        {/* Con un día elegido y sin la ruta real, una línea discontinua une sus paradas en orden. */}
        {showStops && dayView && !(showRoute && canDrawRoute) && (
          <DayPath mapId={MAP_ID} color={routeColor} points={visiblePoints.map(p => ({ lat: p.lat!, lng: p.lng! }))} />
        )}

        {/* Paradas del plan con ubicación: pines numerados, del color de su tipo */}
        {showStops && visiblePoints.map((p, i) => {
          const active = selectedStop?.key === p.key || hoveredActivityId === p.activityId
          return (
            <AdvancedMarker
              key={p.key}
              position={{ lat: p.lat!, lng: p.lng! }}
              zIndex={active ? 15 : 5}
              onClick={() => selectStop(p)}
            >
              <StopPin
                n={i + 1}
                tone={activityById.get(p.activityId)?.type ?? 'place'}
                active={active}
                title={p.label}
                // Con un día elegido, cada pin dice qué es y a qué hora: el día se lee en el mapa.
                label={dayView ? p.label : undefined}
                time={dayView ? dayStops[i]?.time : undefined}
                onHover={over => setHoveredActivity(over ? p.activityId : null)}
              />
            </AdvancedMarker>
          )
        })}

        {location.pos && (
          <AdvancedMarker position={location.pos} zIndex={20}>
            <MyLocationDot />
          </AdvancedMarker>
        )}

        {/* Lugares guardados */}
        {showFavs && filteredFavorites.map(place => {
          const active = selectedFavorite?.id === place.id
          return (
            <AdvancedMarker
              key={place.id}
              position={{ lat: place.lat, lng: place.lng }}
              zIndex={active ? 15 : 2}
              onClick={() => selectFavorite(place)}
            >
              <FavoritePin category={place.category} active={active} title={`${place.name} · ${PLACE_CATEGORY_LABELS[place.category]}`} />
            </AdvancedMarker>
          )
        })}

        {/* Resultados de la búsqueda */}
        {results.map(place => {
          const active = selectedResult?.place_id === place.place_id
          return (
            <AdvancedMarker
              key={place.place_id}
              position={{ lat: place.lat, lng: place.lng }}
              zIndex={active ? 10 : 1}
              onClick={() => selectResult(place)}
            >
              <ResultPin active={active} title={place.name} />
            </AdvancedMarker>
          )
        })}
      </GoogleMap>

      {/* Controles flotantes de arriba. El contenedor no captura el ratón: solo sus piezas. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 [&>*]:pointer-events-auto">
        <div className="flex items-center gap-2">
          <form
            role="search"
            onSubmit={e => { e.preventDefault(); void runSearch() }}
            className="bar-glass flex h-12 min-w-0 flex-1 items-center gap-1 rounded-full border border-border pl-2 pr-1.5 shadow-raised sm:pl-4 md:max-w-md"
          >
            <Search className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              enterKeyHint="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar un sitio"
              aria-label="Buscar un sitio en el mapa"
              className="h-10 min-w-0 flex-1 border-0 bg-transparent px-2 hover:border-0 focus-visible:ring-0"
            />
            {(searchInput || results.length > 0) && (
              <IconButton label="Borrar la búsqueda" size="sm" onClick={clearSearch}><X /></IconButton>
            )}
            <Button type="submit" size="sm" loading={searching}>Buscar</Button>
          </form>
          <Button
            variant="outline" size="sm"
            className="bar-glass h-12 shadow-raised"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen(o => !o)}
          >
            <Layers /> Capas
            {activeFilters > 0 && <Badge tone="primary" solid>{activeFilters}</Badge>}
          </Button>
        </div>

        {layersOpen && (
          <div className="bar-glass ml-auto max-h-[60dvh] w-full max-w-sm space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-border p-4 shadow-raised">
            <div className="flex items-center justify-between gap-2">
              <h3 className="title-card">Qué se ve en el mapa</h3>
              <IconButton label="Cerrar" size="sm" onClick={() => setLayersOpen(false)}><X /></IconButton>
            </div>
            <div className="space-y-2">
              <SwitchRow label="Paradas del plan" description="Los pines numerados de tus actividades." checked={showStops} onCheckedChange={setShowStops} />
              <SwitchRow label="Lugares guardados" description="Tus ideas, con el icono de su tipo." checked={showFavs} onCheckedChange={setShowFavs} />
            </div>
            {showFavs && categories.length > 1 && (
              <div className="space-y-2">
                <p className="eyebrow">Tipo de lugar</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip selected={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>Todos</Chip>
                  {categories.map(c => (
                    <Chip key={c} selected={categoryFilter === c} onClick={() => setCategoryFilter(k => (k === c ? 'all' : c))}>
                      {PLACE_CATEGORY_LABELS[c]}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {showFavs && collections.length > 0 && (
              <div className="space-y-2">
                <p className="eyebrow">Lista</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip selected={collectionFilter === 'all'} onClick={() => setCollectionFilter('all')}>Todas</Chip>
                  {collections.map(c => (
                    <Chip key={c} selected={collectionFilter === c} onClick={() => setCollectionFilter(k => (k === c ? 'all' : c))}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {showResultsList ? (
          /* Resultados de la búsqueda: lista compacta; al elegir uno sale su tarjeta */
          <div className="bar-glass max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-border shadow-raised md:max-w-md">
            <div className="flex items-center justify-between gap-2 py-1 pl-4 pr-1.5">
              <span className="text-sm text-muted-foreground tabular-nums">
                {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
              </span>
              <Button variant="ghost" size="sm" onClick={clearSearch}>Quitar resultados</Button>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {results.map(place => (
                <li key={place.place_id}>
                  <button
                    type="button"
                    onClick={() => selectResult(place)}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-secondary/70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{place.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{place.formatted_address}</span>
                    </span>
                    {place.rating != null && (
                      <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Star className="size-3.5 text-warning" aria-hidden="true" /> {place.rating}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {/* Recorrido y día: qué paradas se ven y si se dibuja la ruta entre ellas */}
            {(routePoints.length >= 2 || dayChips.length >= 2) && (
              <div className="no-scrollbar flex w-fit max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Recorrido y día">
                {routePoints.length >= 2 && (
                  <Chip
                    icon={Route} selected={showRoute && canDrawRoute} disabled={!canDrawRoute} className="shadow-card"
                    onClick={() => setShowRoute(!showRoute)}
                  >
                    Recorrido
                  </Chip>
                )}
                {dayChips.length >= 2 && (
                  <>
                    <Chip selected={dayDate === 'all'} className="shadow-card" onClick={() => { setMapDay('all'); setSelection(null) }}>Todo</Chip>
                    {dayChips.map(d => (
                      <Chip
                        key={d.id} selected={dayDate === d.date} className="shadow-card"
                        onClick={() => { setMapDay(d.id); setSelection(null) }}
                      >
                        <span aria-hidden="true" className="uppercase">{formatDate(d.date, 'EEEEE d')}</span>
                        <span className="sr-only">{formatDate(d.date, "EEEE d 'de' MMMM")}</span>
                      </Chip>
                    ))}
                  </>
                )}
              </div>
            )}
            {showRoute && canDrawRoute && (
              <Segmented<TravelMode>
                label="Cómo se hace el recorrido" size="sm" className="w-fit shadow-card"
                value={travelMode} onChange={setTravelMode}
                options={[
                  { value: 'WALKING', label: 'A pie', icon: Footprints },
                  { value: 'DRIVING', label: 'En coche', icon: Car },
                ]}
              />
            )}
          </>
        )}
      </div>

      {/* Mi ubicación. Se quita con una tarjeta abierta, que ocupa esa franja. */}
      {!hasCard && (
        <Button
          variant={location.following ? 'soft' : 'outline'}
          className={cn('absolute left-3 z-10 shadow-raised', showDayStrip ? 'bottom-36' : 'bottom-8', !location.following && 'bar-glass')}
          aria-pressed={location.following}
          loading={location.locating}
          onClick={toggleLocation}
        >
          {!location.locating && <LocateFixed />}
          {location.following ? 'Dejar de seguirme' : 'Mi ubicación'}
        </Button>
      )}

      {/* La agenda del día elegido. Cede el sitio a la tarjeta de un pin. */}
      {showDayStrip && (
        <DayStrip
          date={dayDate}
          stops={dayStops}
          activeKey={hoveredActivityId ? visiblePoints.find(p => p.activityId === hoveredActivityId)?.key ?? null : null}
          onSelect={selectStop}
          onHover={setHoveredActivity}
        />
      )}

      {/* Tarjeta inferior: la misma para resultado buscado, lugar guardado y parada del plan */}
      {selectedResult && (() => {
        const p = selectedResult
        const saved = favorites?.find(f => f.google_place_id === p.place_id)
        const category = placeTypeToCategory(p.types)
        return (
          <SelectionCard
            key={p.place_id}
            tone={category} icon={<PlaceIcon category={category} />}
            title={p.name}
            badges={saved && <Badge tone="success" icon={BookmarkCheck}>Ya lo tienes guardado</Badge>}
            address={p.formatted_address} rating={p.rating}
            onClose={() => setSelection(null)}
          >
            {canEdit && !saved && (
              <Button variant="primary" size="sm" onClick={() => setSaving(p)}><Bookmark /> Guardar</Button>
            )}
            {saved && (
              <Button variant="soft" size="sm" onClick={() => selectFavorite(saved)}><BookmarkCheck /> Ver guardado</Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setAdding({
                name: p.name, address: p.formatted_address, link: p.url ?? null, place_id: null, lat: p.lat, lng: p.lng, category,
              })}>
                <CalendarPlus /> Añadir al plan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDirectionsTo({ lat: p.lat, lng: p.lng, name: p.name })}>
              <Navigation /> Cómo llegar
            </Button>
            {p.formatted_address && (
              <Button variant="ghost" size="sm" onClick={() => copyAddress(p.formatted_address)}><Copy /> Copiar dirección</Button>
            )}
            {p.url && (
              <Button variant="ghost" size="sm" onClick={() => openLink(p.url!)}><ExternalLink /> Abrir en Google Maps</Button>
            )}
          </SelectionCard>
        )
      })()}

      {selectedFavorite && (() => {
        const f = selectedFavorite
        return (
          <SelectionCard
            key={f.id}
            tone={f.category} icon={<PlaceIcon category={f.category} />}
            title={f.name}
            badges={<>
              <Badge>{PLACE_CATEGORY_LABELS[f.category]}</Badge>
              {f.collection?.trim() && <Badge tone="primary">{f.collection}</Badge>}
            </>}
            address={f.address} rating={f.rating} note={f.notes}
            menu={canEdit && (
              <Menu
                label={`Más opciones de ${f.name}`}
                items={[{ label: 'Quitar de guardados', icon: Trash2, danger: true, onSelect: () => setRemoving(f) }]}
              />
            )}
            onClose={() => setSelection(null)}
          >
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => setAdding(pendingFromFavorite(f))}>
                <CalendarPlus /> Añadir al plan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDirectionsTo({ lat: f.lat, lng: f.lng, name: f.name })}>
              <Navigation /> Cómo llegar
            </Button>
            {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(f)}><Pencil /> Editar</Button>}
            {f.address && <Button variant="ghost" size="sm" onClick={() => copyAddress(f.address!)}><Copy /> Copiar dirección</Button>}
            {f.link && <Button variant="ghost" size="sm" onClick={() => openLink(f.link!)}><ExternalLink /> Abrir enlace</Button>}
          </SelectionCard>
        )
      })()}

      {selectedStop && (() => {
        const s = selectedStop
        const activity = activityById.get(s.activityId)
        return (
          <SelectionCard
            key={s.key}
            tone={activity?.type ?? 'place'}
            icon={activity ? <ActivityIcon type={activity.type} /> : <MapPin aria-hidden="true" />}
            title={s.label}
            badges={s.kind && <Badge>{s.kind === 'origin' ? 'Salida' : 'Llegada'}</Badge>}
            address={s.location}
            meta={s.date ? formatDate(s.date, "EEEE d 'de' MMMM") : undefined}
            onClose={() => setSelection(null)}
          >
            <Button variant="primary" size="sm" onClick={() => navigate(`/trips/${tripId}/itinerary/${s.activityId}`)}>
              <Eye /> Ver actividad
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDirectionsTo({ lat: s.lat, lng: s.lng, name: s.label, address: s.location })}>
              <Navigation /> Cómo llegar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => copyAddress(s.location)}><Copy /> Copiar dirección</Button>
            {activity?.external_link && (
              <Button variant="ghost" size="sm" onClick={() => openLink(activity.external_link!)}><ExternalLink /> Abrir enlace</Button>
            )}
          </SelectionCard>
        )
      })()}

      <SavePlacePanel
        tripId={tripId}
        place={saving}
        onClose={() => setSaving(null)}
        onSaved={() => { setSaving(null); setSelection(null); resetSearch() }}
      />
      <AddToPlanPanel open={!!adding} onOpenChange={o => { if (!o) setAdding(null) }} tripId={tripId} place={adding} />
      <PlaceEditPanel tripId={tripId} place={editing} onClose={() => setEditing(null)} />
      <DirectionsPanel target={directionsTo} onClose={() => setDirectionsTo(null)} />
      <Confirm
        danger
        open={!!removing}
        onOpenChange={o => { if (!o) setRemoving(null) }}
        title="¿Quitar este lugar de guardados?"
        description={<>«{removing?.name}» dejará de estar entre tus ideas. Si ya lo añadiste al plan, esa actividad no se toca.</>}
        confirmLabel="Quitar"
        onConfirm={() => {
          if (removing) deleteFavorite.mutate({ id: removing.id, tripId })
          setRemoving(null)
          setSelection(null)
        }}
      />
    </>
  )
}
