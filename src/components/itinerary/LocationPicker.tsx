import { useState, useCallback } from 'react'
import { APIProvider, Map, AdvancedMarker, Pin, ColorScheme } from '@vis.gl/react-google-maps'
import { Search, MapPin, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

export interface LatLng { lat: number; lng: number }

interface LocationPickerProps {
  value?: string
  onChange: (address: string, coords?: LatLng | null) => void
  placeholder?: string
  center?: LatLng
}

interface Pending { address: string; lat?: number; lng?: number }
interface SearchHit { name: string; address: string; lat: number; lng: number }

export function LocationPicker({ value, onChange, placeholder = 'Seleccionar ubicación', center }: LocationPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="flex-1 justify-start text-left font-normal"
        >
          <MapPin size={14} className="mr-2 opacity-60 flex-shrink-0" />
          <span className={value ? '' : 'text-muted-foreground'}>{value || placeholder}</span>
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange('', null)} title="Quitar">
            <X size={14} />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif">Elegir ubicación</DialogTitle>
          </DialogHeader>
          {!API_KEY ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Falta la API Key de Google Maps.
            </p>
          ) : (
            <Inner
              initial={value}
              center={center}
              onPick={(addr, coords) => { onChange(addr, coords); setOpen(false) }}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Inner({ initial, center, onPick, onCancel }: {
  initial?: string
  center?: LatLng
  onPick: (address: string, coords?: LatLng | null) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [pending, setPending] = useState<Pending | null>(initial ? { address: initial } : null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const defaultCenter = center ?? { lat: 40.4168, lng: -3.7038 }

  const search = useCallback(async () => {
    const q = query.trim()
    if (!q || typeof google === 'undefined' || !google.maps?.places) return
    const bias = mapInstance?.getCenter() ?? undefined
    try {
      if (google.maps.places.Place?.searchByText) {
        const { places } = await google.maps.places.Place.searchByText({
          textQuery: q,
          fields: ['displayName', 'formattedAddress', 'location'],
          maxResultCount: 8,
          ...(bias ? { locationBias: bias } : {}),
        })
        if (places?.length) {
          setResults(places.filter(p => p.location).map(p => ({
            name: p.displayName ?? '',
            address: p.formattedAddress ?? p.displayName ?? '',
            lat: p.location!.lat(),
            lng: p.location!.lng(),
          })))
          return
        }
      }
    } catch { /* cae a legacy */ }
    try {
      const svc = new google.maps.places.PlacesService(mapInstance ?? document.createElement('div'))
      svc.textSearch({ query: q, ...(bias ? { location: bias, radius: 50000 } : {}) }, (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) {
          setResults(res.filter(r => r.geometry?.location).map(r => ({
            name: r.name ?? '',
            address: r.formatted_address ?? r.name ?? '',
            lat: r.geometry!.location!.lat(),
            lng: r.geometry!.location!.lng(),
          })))
        } else {
          setResults([])
        }
      })
    } catch { setResults([]) }
  }, [query, mapInstance])

  function choose(hit: SearchHit) {
    setPending({ address: hit.address, lat: hit.lat, lng: hit.lng })
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
    } catch { /* sin Geocoding API: usamos las coordenadas */ }
    setPending({ address, lat: ll.lat, lng: ll.lng })
  }

  return (
    <APIProvider apiKey={API_KEY} libraries={['places']}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar dirección o lugar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
              className="pl-9"
            />
          </div>
          <Button type="button" onClick={search}>Buscar</Button>
        </div>

        {results.length > 0 && (
          <ScrollArea className="max-h-40 rounded-lg border border-border">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => choose(r)}
                className="w-full text-left px-3 py-2 hover:bg-secondary border-b border-border/50 last:border-0"
              >
                <p className="text-sm font-medium line-clamp-1">{r.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{r.address}</p>
              </button>
            ))}
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground">Busca arriba o toca un punto del mapa.</p>

        <div className="rounded-lg overflow-hidden border border-border" style={{ height: 300 }}>
          <Map
            defaultCenter={pending?.lat ? { lat: pending.lat, lng: pending.lng! } : defaultCenter}
            defaultZoom={pending?.lat ? 15 : 11}
            mapId="wanderlog-map"
            colorScheme={ColorScheme.FOLLOW_SYSTEM}
            onIdle={(e) => setMapInstance(e.map)}
            onClick={handleMapClick}
            className="w-full h-full"
          >
            {pending?.lat != null && pending.lng != null && (
              <AdvancedMarker position={{ lat: pending.lat, lng: pending.lng }}>
                <Pin background="#6366f1" glyphColor="#ffffff" borderColor="#818cf8" />
              </AdvancedMarker>
            )}
          </Map>
        </div>

        {pending?.address && (
          <p className="text-sm flex items-center gap-1.5">
            <MapPin size={13} style={{ color: 'var(--primary)' }} />
            {pending.address}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button
            type="button"
            disabled={!pending?.address}
            onClick={() => pending?.address && onPick(
              pending.address,
              pending.lat != null && pending.lng != null ? { lat: pending.lat, lng: pending.lng } : null,
            )}
            style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
          >
            Usar esta ubicación
          </Button>
        </DialogFooter>
      </div>
    </APIProvider>
  )
}
