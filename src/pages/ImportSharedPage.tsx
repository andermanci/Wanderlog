import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  Loader2, Search, MapPin, Sparkles, Check, ExternalLink, Calendar, ArrowLeft, Link2, Share, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PlaceIcon } from '@/components/places/PlaceIcon'
import { AddToItineraryDialog, type PendingPlace } from '@/components/places/AddToItineraryDialog'
import { useInterpretSharedLink } from '@/lib/queries/shareImport'
import { useTrips } from '@/lib/queries/trips'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useSaveFavoritePlace } from '@/lib/queries/places'
import { placeTypeToCategory } from '@/lib/maps'
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS } from '@/lib/utils'
import type { PlaceCategory } from '@/types/database'
import { toast } from 'sonner'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''
// Colección donde se agrupan todos los sitios importados desde vídeos/enlaces.
const COLLECTION = 'Ideas de vídeos'

// Apple no deja que una PWA aparezca en el menú "Compartir" (sí en Android vía
// share_target). Para que en iPhone/iPad se pueda compartir desde TikTok/
// Instagram sin copiar el enlace a mano, ofrecemos un Atajo firmado que recibe
// lo compartido y abre /import/shared?url=… en la app.
const isAppleTouch =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

interface Candidate {
  name: string
  address: string | null
  lat: number
  lng: number
  place_id: string
  category: PlaceCategory
  rating: number | null
  photoUrl: string | null
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function ImportSharedPage() {
  const [params] = useSearchParams()
  // Android manda el enlace en `url`; TikTok/Instagram a veces lo meten dentro
  // de `text`. Se coge el primero que aparezca.
  const sharedUrl = useMemo(() => {
    const u = params.get('url')?.trim()
    if (u) return u
    const text = `${params.get('text') ?? ''} ${params.get('title') ?? ''}`
    return text.match(/https?:\/\/[^\s]+/)?.[0] ?? ''
  }, [params])
  // Viaje ya fijado si se abre desde dentro de un viaje (?trip=…).
  const presetTripId = params.get('trip') ?? ''

  return (
    <APIProvider apiKey={API_KEY} libraries={['places']}>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <Inner sharedUrl={sharedUrl} presetTripId={presetTripId} />
      </div>
    </APIProvider>
  )
}

function Inner({ sharedUrl, presetTripId }: { sharedUrl: string; presetTripId: string }) {
  const navigate = useNavigate()
  const placesLib = useMapsLibrary('places')
  const interpret = useInterpretSharedLink()
  const savePlace = useSaveFavoritePlace()
  const { data: trips } = useTrips()

  // Enlace a interpretar: el compartido, o el que el usuario pegue a mano.
  const [urlInput, setUrlInput] = useState(sharedUrl)
  const [manualText, setManualText] = useState('')

  // Búsqueda/resolución del sitio en Google Places.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [chosen, setChosen] = useState<Candidate | null>(null)
  const [searching, setSearching] = useState(false)
  const autoSearched = useRef(false)

  // Destino elegido. Si se abrió desde dentro de un viaje, ya viene fijado (y la
  // heurística de preselección de abajo no lo pisa porque tripId ya no está vacío).
  const [tripId, setTripId] = useState(presetTripId)
  const [guideId, setGuideId] = useState('')
  const { data: guides } = useDestinationGuides(tripId)

  const [savedPlace, setSavedPlace] = useState<PendingPlace | null>(null)
  const [addToItinerary, setAddToItinerary] = useState(false)

  const guess = interpret.data
  // Si se abrió desde dentro de un viaje, no tiene sentido volver a preguntarlo.
  const presetTrip = presetTripId ? trips?.find(t => t.id === presetTripId) : undefined

  // Lanza la interpretación en cuanto hay un enlace compartido (una sola vez).
  useEffect(() => {
    if (sharedUrl && !interpret.isPending && !interpret.data && !interpret.error) {
      interpret.mutate({ url: sharedUrl })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl])

  // Preselecciona el viaje: el que casa con la ciudad/país detectados; si no,
  // el primero en curso o próximo; si no, el primero de la lista.
  useEffect(() => {
    if (!trips?.length || tripId) return
    const hay = `${guess?.city ?? ''} ${guess?.country ?? ''}`.toLowerCase().trim()
    const byPlace = hay
      ? trips.find(t => hay.split(' ').some(w => w.length > 2 && t.destination.toLowerCase().includes(w)))
      : undefined
    const upcoming = trips.find(t => t.end_date >= todayISO())
    setTripId((byPlace ?? upcoming ?? trips[0]).id)
  }, [trips, guess, tripId])

  // Preselecciona la guía (ciudad) cuyo nombre casa con la ciudad detectada.
  useEffect(() => {
    if (!guides?.length || !guess?.city) { setGuideId(''); return }
    const city = guess.city.toLowerCase()
    const match = guides.find(g => g.name.toLowerCase().includes(city) || city.includes(g.name.toLowerCase()))
    setGuideId(match?.id ?? '')
  }, [guides, guess])

  // Cuando llega la interpretación, prepara la búsqueda con el nombre + ciudad.
  // Si no se reconoció el local, deja la ciudad puesta para que el usuario solo
  // tenga que añadir el nombre del sitio.
  useEffect(() => {
    if (guess?.placeName) setQuery([guess.placeName, guess.city].filter(Boolean).join(' '))
    else if (guess?.city) setQuery(guess.city + ' ')
  }, [guess])

  async function runSearch(q: string) {
    const text = q.trim()
    if (!text || !placesLib) return
    setSearching(true)
    try {
      // Ojo: 'id' NO va en fields (la API lo rechaza); `p.id` viene siempre.
      // Mismos campos que el LocationPicker que ya funciona, + types/rating.
      const { places } = await placesLib.Place.searchByText({
        textQuery: text,
        fields: ['displayName', 'formattedAddress', 'location', 'photos', 'types', 'rating'],
        maxResultCount: 6,
      })
      const hits: Candidate[] = (places ?? []).filter(p => p.location && p.id).map(p => {
        let photoUrl: string | null = null
        try { photoUrl = (p.photos?.[0] as unknown as { getURI?: (o: { maxWidthPx: number }) => string })?.getURI?.({ maxWidthPx: 800 }) ?? null } catch { /* sin foto */ }
        return {
          name: p.displayName ?? text,
          address: p.formattedAddress ?? null,
          lat: p.location!.lat(),
          lng: p.location!.lng(),
          place_id: p.id!,
          category: placeTypeToCategory(p.types ?? []),
          rating: p.rating ?? null,
          photoUrl,
        }
      })
      setResults(hits)
      setChosen(hits[0] ?? null)
      if (hits.length === 0) toast.error('No se encontró el sitio. Prueba a ajustar la búsqueda.')
    } catch (err) {
      console.error('[share-import] searchByText falló:', err)
      setResults([]); setChosen(null)
      toast.error('No se pudo buscar en el mapa')
    } finally {
      setSearching(false)
    }
  }

  // Autobúsqueda: en cuanto Places está listo y hay un nombre sugerido.
  useEffect(() => {
    if (placesLib && guess?.placeName && !autoSearched.current) {
      autoSearched.current = true
      runSearch([guess.placeName, guess.city].filter(Boolean).join(' '))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, guess])

  async function save() {
    if (!chosen || !tripId) return
    try {
      await savePlace.mutateAsync({
        trip_id: tripId,
        google_place_id: chosen.place_id,
        name: chosen.name,
        address: chosen.address,
        lat: chosen.lat,
        lng: chosen.lng,
        category: chosen.category,
        rating: chosen.rating,
        notes: guess?.why ?? null,
        link: sharedUrl || urlInput || null,
        collection: COLLECTION,
        guide_id: guideId || null,
      })
      setSavedPlace({
        name: chosen.name,
        address: chosen.address,
        link: sharedUrl || urlInput || null,
        place_id: chosen.place_id,
        lat: chosen.lat,
        lng: chosen.lng,
        category: chosen.category,
      })
    } catch {
      /* el toast de error ya lo lanza el hook */
    }
  }

  // Reintenta la interpretación con la misma entrada (para errores transitorios
  // como la saturación de la IA).
  function retryInterpret() {
    autoSearched.current = false
    interpret.mutate(sharedUrl ? { url: sharedUrl } : { manualText: manualText.trim() })
  }

  // --- 1. Sin enlace todavía: pedir que peguen uno ---------------------------
  if (!sharedUrl && !guess) {
    return (
      <PasteLink
        value={urlInput}
        onChange={setUrlInput}
        loading={interpret.isPending}
        onSubmit={() => urlInput.trim() && interpret.mutate({ url: urlInput.trim() })}
      />
    )
  }

  // --- 2. Interpretando el enlace -------------------------------------------
  if (interpret.isPending) {
    return (
      <div className="text-center py-16 space-y-4">
        <Sparkles className="mx-auto animate-pulse" size={32} style={{ color: 'var(--primary)' }} />
        <p className="font-serif text-lg">Leyendo el enlace…</p>
        <p className="text-sm text-muted-foreground">Estamos entendiendo de qué sitio habla el vídeo.</p>
        <Skeleton className="h-24 w-full" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  // --- 3. Error (p. ej. IA saturada) o Instagram sin texto -------------------
  if (interpret.error || guess?.needsManualText) {
    const isError = !!interpret.error
    return (
      <div className="space-y-4">
        <BackLink />
        <h1 className="font-serif text-2xl">
          {isError ? 'No se pudo leer el enlace' : 'Pega el texto del vídeo'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isError
            ? interpret.error!.message
            : 'Instagram no deja leer el texto automáticamente. Copia la descripción del post (dónde está el sitio y su nombre) y pégala aquí.'}
        </p>

        {/* Errores transitorios (IA saturada): reintentar con la misma entrada. */}
        {isError && (
          <Button
            variant="brand"
            className="w-full gap-2"
            disabled={interpret.isPending}
            onClick={retryInterpret}
          >
            {interpret.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Reintentar
          </Button>
        )}

        {guess?.thumbnailUrl && (
          <img src={guess.thumbnailUrl} alt="" className="rounded-xl w-full max-h-56 object-cover" />
        )}

        {/* Alternativa siempre disponible: pegar el texto del vídeo a mano. */}
        <div className="space-y-2">
          {isError && <p className="text-sm text-muted-foreground">O pega a mano la descripción del vídeo:</p>}
          <Textarea
            rows={4}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Ej: El mejor ramen de Tokio está en Ichiran, Shibuya…"
          />
          <Button
            variant={isError ? 'outline' : 'brand'}
            className="w-full gap-2"
            disabled={!manualText.trim() || interpret.isPending}
            onClick={() => { autoSearched.current = false; interpret.mutate({ manualText: manualText.trim() }) }}
          >
            <Sparkles size={16} /> Interpretar el texto
          </Button>
        </div>
      </div>
    )
  }

  // --- 4. Sitio interpretado: confirmar, elegir viaje y guardar --------------
  if (savedPlace) {
    return (
      <div className="text-center py-12 space-y-5">
        <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <Check size={30} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="font-serif text-2xl">Guardado en el viaje</h1>
          <p className="text-sm text-muted-foreground mt-1">{savedPlace.name}</p>
        </div>
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <Button variant="brand" className="gap-2" onClick={() => setAddToItinerary(true)}>
            <Calendar size={16} /> Añadir al itinerario ahora
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/trips/${tripId}/places`}>Ver lugares guardados</Link>
          </Button>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>Ir al inicio</Button>
        </div>
        <AddToItineraryDialog
          open={addToItinerary}
          onOpenChange={(o) => { setAddToItinerary(o); if (!o) navigate(`/trips/${tripId}/places`) }}
          tripId={tripId}
          place={savedPlace}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <BackLink />
      <div>
        <h1 className="font-serif text-2xl">¿Es este sitio?</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {guess?.placeName
            ? 'Esto es lo que hemos entendido del vídeo. Revísalo y guárdalo.'
            : 'No hemos podido leer el nombre del sitio (a veces solo se dice hablando en el vídeo). Escríbelo aquí y lo buscamos.'}
        </p>
      </div>

      {guess?.why && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--secondary)' }}>
          <Sparkles size={13} className="inline mr-1.5 -mt-0.5" style={{ color: 'var(--primary)' }} />
          {guess.why}
        </p>
      )}

      {/* Buscador (editable) */}
      <div className="space-y-2">
        <Label>Sitio</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus={!guess?.placeName}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch(query))}
              placeholder="Nombre del sitio y ciudad"
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => runSearch(query)} disabled={searching}>
            {searching ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
          </Button>
        </div>
      </div>

      {/* Candidatos */}
      {searching && !results.length ? (
        <Skeleton className="h-16 w-full" style={{ background: 'var(--secondary)' }} />
      ) : results.length > 0 && (
        <div className="space-y-2">
          {results.map(r => {
            const active = chosen?.place_id === r.place_id
            return (
              <button
                key={r.place_id}
                type="button"
                onClick={() => setChosen(r)}
                className="w-full text-left rounded-xl p-3 flex items-center gap-3 transition-colors"
                style={{
                  background: 'var(--card)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {r.photoUrl
                  ? <img src={r.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  : (
                    <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${PLACE_CATEGORY_COLORS[r.category]}1f` }}>
                      <PlaceIcon category={r.category} size={20} style={{ color: PLACE_CATEGORY_COLORS[r.category] }} />
                    </span>
                  )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium line-clamp-1">{r.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {PLACE_CATEGORY_LABELS[r.category]}{r.address ? ` · ${r.address}` : ''}
                  </p>
                </div>
                {active && <Check size={18} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}

      {/* Destino: solo se pregunta si NO se abrió ya desde un viaje concreto. */}
      {presetTripId ? (
        presetTrip && (
          <p className="text-sm text-muted-foreground">
            Se añadirá a <span className="font-medium text-foreground">{presetTrip.name}</span>
          </p>
        )
      ) : (
        <div className="space-y-2">
          <Label>Viaje</Label>
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:border-primary"
          >
            {(trips ?? []).map(t => <option key={t.id} value={t.id}>{t.name} · {t.destination}</option>)}
          </select>
        </div>
      )}

      {(guides?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <Label>Ciudad (guía)</Label>
          <select
            value={guideId}
            onChange={(e) => setGuideId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Sin ciudad</option>
            {guides!.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {sharedUrl && (
        <a href={sharedUrl} target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground flex items-center gap-1.5 hover:text-primary">
          <ExternalLink size={12} /> Ver el vídeo original
        </a>
      )}

      <Button
        variant="brand"
        className="w-full gap-2"
        disabled={!chosen || !tripId || savePlace.isPending}
        onClick={save}
      >
        {savePlace.isPending ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
        Guardar en el viaje
      </Button>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/dashboard" className="text-sm text-muted-foreground flex items-center gap-1.5 hover:text-primary">
      <ArrowLeft size={14} /> Inicio
    </Link>
  )
}

function PasteLink({ value, onChange, onSubmit, loading }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; loading: boolean
}) {
  return (
    <div className="space-y-4">
      <BackLink />
      <div>
        <h1 className="font-serif text-2xl">Añadir desde un enlace</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pega el enlace de un vídeo de TikTok/Instagram o de una web. Sacamos el sitio y lo
          guardamos en tu viaje.
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onSubmit())}
            placeholder="https://…"
            className="pl-9"
          />
        </div>
        <Button variant="brand" onClick={onSubmit} disabled={!value.trim() || loading} className="gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Leer
        </Button>
      </div>

      {isAppleTouch && <IOSShortcutCard />}
    </div>
  )
}

// En iPhone/iPad: tarjeta para instalar el Atajo que añade Wanderlog al menú
// "Compartir" de TikTok/Instagram/Safari (lo que Android hace de serie).
function IOSShortcutCard() {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--secondary)' }}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
          <Share size={17} style={{ color: 'var(--primary)' }} />
        </span>
        <div className="space-y-0.5">
          <p className="font-medium text-sm">¿En iPhone? Comparte sin copiar el enlace</p>
          <p className="text-xs text-muted-foreground">
            Instala el Atajo y aparecerá <span className="font-medium text-foreground">Añadir a Wanderlog</span> en
            el menú «Compartir» de TikTok, Instagram y Safari. Toca compartir → Wanderlog y listo.
          </p>
        </div>
      </div>
      <Button variant="brand" asChild className="w-full gap-2">
        <a href="/wanderlog-importar.shortcut">
          <Download size={16} /> Descargar el Atajo
        </a>
      </Button>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Se abrirá la app Atajos; pulsa <span className="font-medium text-foreground">Añadir atajo</span>. Luego,
        desde un vídeo, usa Compartir → Añadir a Wanderlog.
      </p>
    </div>
  )
}
