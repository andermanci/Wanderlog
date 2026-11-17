import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, ColorScheme, Map, Pin, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MapPin, MapPinned, Search, X } from 'lucide-react'
import { Button, IconButton, Input, Notice, Row, RowList, toneColor } from '@/design'
import { cn } from '@/lib/utils'
import { PanelFooter } from './PanelFooter'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

export interface LatLng { lat: number; lng: number }

/** Lo que Google sabe del sitio elegido, además de dónde está. */
export interface PlaceMeta { photoUrl?: string | null }

interface LocationFieldProps {
  label: string
  value?: string
  placeholder?: string
  /** Abre el paso de elegir ubicación (lo pinta el mismo panel con `LocationPickerStep`). */
  onOpen: () => void
  onClear: () => void
}

/**
 * El campo del formulario: enseña la ubicación elegida y, al pulsarlo, lleva
 * al paso de buscarla. No es un campo de texto: una ubicación escrita a mano
 * no tendría coordenadas y no saldría en el mapa.
 */
export function LocationField({ label, value, placeholder = 'Buscar un sitio o una dirección', onOpen, onClear }: LocationFieldProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={value ? `${label}: ${value}. Cambiar` : `${label}: elegir`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-input bg-card px-3.5 py-2 text-left text-[0.9375rem] transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground/70')}>{value || placeholder}</span>
        </button>
        {value && (
          <IconButton label={`Quitar ${label.toLowerCase()}`} onClick={onClear}><X /></IconButton>
        )}
      </div>
    </div>
  )
}

interface Pending { address: string; lat?: number; lng?: number; photoUrl?: string | null }
interface SearchHit { name: string; address: string; lat: number; lng: number; photoUrl?: string | null }

interface LocationPickerStepProps {
  /** La ubicación que ya había, para partir de ella. */
  initial?: string
  initialCoords?: LatLng | null
  /** Hacia dónde sesgar la búsqueda si no hay nada elegido. */
  center?: LatLng
  onPick: (address: string, coords: LatLng | null, meta: PlaceMeta) => void
  onCancel: () => void
}

/**
 * Paso «elegir ubicación» del panel de actividad: buscar en Google Places o
 * tocar el punto exacto en el mapa. Va DENTRO del `<APIProvider>` que monta la
 * pantalla del Plan; pinta sus botones en el pie del panel.
 */
export function LocationPickerStep({ initial, initialCoords, center, onPick, onCancel }: LocationPickerStepProps) {
  const places = useMapsLibrary('places')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle')
  const [pending, setPending] = useState<Pending | null>(
    initial ? { address: initial, lat: initialCoords?.lat, lng: initialCoords?.lng } : null,
  )
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  // Cada mapa que se pinta se factura, y casi siempre basta con buscar y elegir
  // de la lista. El mapa solo se monta si la persona lo pide.
  const [showMap, setShowMap] = useState(false)
  const pinColor = useMemo(() => (showMap ? toneColor('primary') : ''), [showMap])

  // Google Maps guarda el tamaño del contenedor al arrancar; si el panel aún
  // se estaba animando, el mapa queda encogido en una esquina. Se le da un
  // empujón al estar listo (y otro tras la animación).
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

  // Solo se busca al pulsar «Buscar» o Intro (no mientras se escribe): cada
  // consulta cuenta contra la cuota diaria de Google.
  const search = useCallback(async () => {
    const q = query.trim()
    if (!q || !places?.Place) return
    // Sin mapa montado, la búsqueda se sesga hacia lo ya elegido o el centro dado.
    const bias = mapInstance?.getCenter()
      ?? (pending?.lat != null && pending.lng != null ? { lat: pending.lat, lng: pending.lng } : center)
    setStatus('searching')
    try {
      const { places: found } = await places.Place.searchByText({
        textQuery: q,
        fields: ['displayName', 'formattedAddress', 'location', 'photos'],
        maxResultCount: 8,
        ...(bias ? { locationBias: bias } : {}),
      })
      const hits = (found ?? []).filter(p => p.location).map(p => {
        let photoUrl: string | null = null
        // API nueva: getURI({maxWidthPx}); los tipos instalados aún no lo recogen.
        try { photoUrl = (p.photos?.[0] as unknown as { getURI?: (o: { maxWidthPx: number }) => string })?.getURI?.({ maxWidthPx: 800 }) ?? null } catch { /* sin foto */ }
        return {
          name: p.displayName ?? '',
          address: p.formattedAddress ?? p.displayName ?? '',
          lat: p.location!.lat(),
          lng: p.location!.lng(),
          photoUrl,
        }
      })
      setResults(hits)
      setStatus(hits.length ? 'idle' : 'empty')
    } catch {
      setResults([])
      setStatus('error')
    }
  }, [query, places, mapInstance, pending, center])

  function choose(hit: SearchHit) {
    setPending({ address: hit.address, lat: hit.lat, lng: hit.lng, photoUrl: hit.photoUrl })
    setResults([])
    mapInstance?.panTo({ lat: hit.lat, lng: hit.lng })
    mapInstance?.setZoom(15)
  }

  async function handleMapClick(e: { detail: { latLng: google.maps.LatLngLiteral | null } }) {
    const ll = e.detail.latLng
    if (!ll) return
    let address = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`
    try {
      const geocoder = new google.maps.Geocoder()
      const { results: geo } = await geocoder.geocode({ location: ll })
      if (geo?.[0]?.formatted_address) address = geo[0].formatted_address
    } catch { /* sin Geocoding: se usan las coordenadas */ }
    setPending({ address, lat: ll.lat, lng: ll.lng })
  }

  if (!API_KEY) {
    return (
      <>
        <Notice tone="warning" title="El mapa no está disponible">
          Falta la clave de Google Maps, así que ahora no se pueden buscar sitios.
        </Notice>
        <PanelFooter><Button variant="ghost" onClick={onCancel}>Volver</Button></PanelFooter>
      </>
    )
  }

  const hasPoint = pending?.lat != null && pending.lng != null
  const mapCenter = hasPoint ? { lat: pending.lat!, lng: pending.lng! } : center ?? { lat: 40.4168, lng: -3.7038 }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); e.stopPropagation(); void search() }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            type="search"
            aria-label="Buscar un sitio o una dirección"
            placeholder="Nombre del sitio o dirección"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="secondary" loading={status === 'searching'} disabled={!query.trim() || !places}>
          Buscar
        </Button>
      </form>

      {results.length > 0 && (
        <RowList>
          {results.map((r, i) => (
            <Row key={i} icon={MapPin} tone="place" title={r.name || r.address} subtitle={r.name ? r.address : undefined} onClick={() => choose(r)} />
          ))}
        </RowList>
      )}
      {status === 'empty' && (
        <Notice tone="neutral">No hemos encontrado nada con ese nombre. Prueba con otras palabras o elige el punto en el mapa.</Notice>
      )}
      {status === 'error' && (
        <Notice tone="warning">Ahora mismo no se puede buscar. Inténtalo dentro de un rato o elige el punto en el mapa.</Notice>
      )}

      {pending?.address && (
        <div data-tone="primary" className="flex items-start gap-3 rounded-xl border border-tone-line bg-tone-soft px-4 py-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-tone" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Ubicación elegida</p>
            <p className="break-words text-[0.9375rem]">{pending.address}</p>
          </div>
        </div>
      )}

      <div className="h-72 overflow-hidden rounded-xl border border-border">
        {showMap ? (
          <Map
            defaultCenter={mapCenter}
            defaultZoom={hasPoint ? 15 : 11}
            mapId="wanderlog-map"
            colorScheme={ColorScheme.FOLLOW_SYSTEM}
            onIdle={e => setMapInstance(e.map)}
            onClick={handleMapClick}
            className="size-full"
          >
            {hasPoint && (
              <AdvancedMarker position={{ lat: pending.lat!, lng: pending.lng! }}>
                <Pin background={pinColor} borderColor={pinColor} glyphColor="white" />
              </AdvancedMarker>
            )}
          </Map>
        ) : (
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="flex size-full flex-col items-center justify-center gap-2 bg-sunken text-muted-foreground transition-colors hover:text-foreground"
          >
            <MapPinned className="size-6" aria-hidden="true" />
            <span className="text-[0.9375rem] font-medium text-foreground">Elegir en el mapa</span>
            <span className="text-sm">Para marcar el punto exacto con el dedo</span>
          </button>
        )}
      </div>
      {showMap && <p className="text-sm text-muted-foreground">Toca el mapa donde quieras poner el punto.</p>}

      <PanelFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          disabled={!pending?.address}
          onClick={() => pending?.address && onPick(
            pending.address,
            pending.lat != null && pending.lng != null ? { lat: pending.lat, lng: pending.lng } : null,
            { photoUrl: pending.photoUrl ?? null },
          )}
        >
          Usar esta ubicación
        </Button>
      </PanelFooter>
    </div>
  )
}
