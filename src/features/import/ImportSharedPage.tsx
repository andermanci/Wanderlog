import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  ArrowLeft, ArrowRight, CalendarPlus, Check, CircleCheck, ExternalLink, Link2, MapPin, Plane, RotateCcw, Search,
  Sparkles, Star, TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge, Button, Card, Empty, Field, Input, Notice, Page, PlaceIcon, Select, Skeleton, Spinner, Textarea,
} from '@/design'
import { useInterpretSharedLink, type SharedPlaceGuess } from '@/lib/queries/shareImport'
import { useTrips } from '@/lib/queries/trips'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useSaveFavoritePlace } from '@/lib/queries/places'
import { placeTypeToCategory } from '@/lib/maps'
import { PLACE_CATEGORY_LABELS, cn } from '@/lib/utils'
import { useA11yStore } from '@/store/a11yStore'
import type { PlaceCategory } from '@/types/database'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''
// Colección donde se agrupan todos los sitios importados desde vídeos/enlaces.
const COLLECTION = 'Ideas de vídeos'

// Apple no deja que una PWA aparezca en el menú "Compartir" (sí en Android vía
// share_target). Para que en iPhone/iPad se pueda compartir desde TikTok/
// Instagram sin copiar el enlace a mano, ofrecemos un Atajo firmado que recibe
// lo compartido y abre /import/shared?url=… en la app.
//
// DESACTIVADO, igual que en la pantalla anterior: la tarjeta que ofrecía el
// Atajo (`IOSShortcutCard`) no se muestra. Cuando se reactive, va en el paso 1,
// debajo del campo del enlace, solo si `isAppleTouch`:
//
// const isAppleTouch =
//   typeof navigator !== 'undefined' &&
//   (/iP(hone|ad|od)/.test(navigator.userAgent) ||
//     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
//
// {/* {isAppleTouch && <IOSShortcutCard />} */}
//
// La tarjeta decía: «¿En iPhone? Comparte sin copiar el enlace. Instala el Atajo
// y aparecerá "Añadir a Wanderlog" en el menú «Compartir» de TikTok, Instagram
// y Safari», con un botón «Descargar el Atajo» a /wanderlog-importar.shortcut y
// la nota «Se abrirá la app Atajos; pulsa "Añadir atajo"».

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

/** Asistente para guardar en un viaje el sitio del que habla un vídeo o una web. */
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
      <Page
        title="Importar desde un enlace"
        subtitle="Guarda en tu viaje el sitio del que habla un vídeo o una web."
        width="narrow"
      >
        <Asistente sharedUrl={sharedUrl} presetTripId={presetTripId} />
      </Page>
    </APIProvider>
  )
}

type Paso = 'enlace' | 'leer' | 'sitio' | 'viaje' | 'guardado'

const ROTULOS: Record<Paso, string> = {
  enlace: 'Enlace',
  leer: 'Lectura',
  sitio: 'Sitio',
  viaje: 'Viaje',
  guardado: 'Guardado',
}

/** Indicador de paso: «Paso 2 de 5 · Lectura» y una barra por paso. */
function Pasos({ pasos, actual }: { pasos: Paso[]; actual: Paso }) {
  const i = pasos.indexOf(actual)
  return (
    <div className="mb-6">
      <p className="eyebrow" aria-live="polite">
        Paso {i + 1} de {pasos.length} · {ROTULOS[actual]}
      </p>
      <ol className="mt-2 flex gap-1.5" aria-hidden="true">
        {pasos.map((p, n) => (
          <li
            key={p}
            className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', n <= i ? 'bg-primary' : 'bg-secondary')}
          />
        ))}
      </ol>
    </div>
  )
}

function Asistente({ sharedUrl, presetTripId }: { sharedUrl: string; presetTripId: string }) {
  const navigate = useNavigate()
  const placesLib = useMapsLibrary('places')
  const interpret = useInterpretSharedLink()
  const savePlace = useSaveFavoritePlace()
  const { data: trips, isLoading: cargandoViajes } = useTrips()

  // Enlace a interpretar: el compartido, o el que la persona pegue a mano.
  const [urlInput, setUrlInput] = useState(sharedUrl)
  // El enlace que de verdad se ha leído (es el que se guarda con el sitio).
  const [enlace, setEnlace] = useState(sharedUrl)
  const [manualText, setManualText] = useState('')
  // «Usar otro enlace»: vuelve al paso 1 aunque la página se abriera con uno.
  const [otroEnlace, setOtroEnlace] = useState(false)

  // Búsqueda/resolución del sitio en Google Places.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [chosen, setChosen] = useState<Candidate | null>(null)
  const [searching, setSearching] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const autoSearched = useRef(false)

  // Destino elegido a mano. Si se abrió desde dentro de un viaje, ya viene fijado
  // (y la sugerencia de abajo no lo pisa: solo vale mientras esto esté vacío).
  const [tripElegidoId, setTripElegidoId] = useState(presetTripId)
  // null = la persona no ha tocado el desplegable: vale la ciudad sugerida.
  const [guideElegidaId, setGuideElegidaId] = useState<string | null>(null)
  const guess = interpret.data

  // Viaje sugerido: el que casa con la ciudad/país detectados; si no, el primero
  // en curso o próximo; si no, el primero de la lista.
  const tripSugeridoId = useMemo(() => {
    if (!trips?.length) return ''
    const hay = `${guess?.city ?? ''} ${guess?.country ?? ''}`.toLowerCase().trim()
    const byPlace = hay
      ? trips.find(t => hay.split(' ').some(w => w.length > 2 && t.destination.toLowerCase().includes(w)))
      : undefined
    const upcoming = trips.find(t => t.end_date >= todayISO())
    return (byPlace ?? upcoming ?? trips[0]).id
  }, [trips, guess])
  const tripId = tripElegidoId || tripSugeridoId
  const { data: guides } = useDestinationGuides(tripId)

  // Guía (ciudad) sugerida: aquella cuyo nombre casa con la ciudad detectada.
  const guideSugeridaId = useMemo(() => {
    if (!guides?.length || !guess?.city) return ''
    const city = guess.city.toLowerCase()
    return guides.find(g => g.name.toLowerCase().includes(city) || city.includes(g.name.toLowerCase()))?.id ?? ''
  }, [guides, guess])
  const guideId = guideElegidaId ?? guideSugeridaId

  // El sitio está confirmado y toca elegir dónde se guarda.
  const [eligiendoViaje, setEligiendoViaje] = useState(false)
  const [savedPlaceId, setSavedPlaceId] = useState<string | null>(null)

  // Si se abrió desde dentro de un viaje, no tiene sentido volver a preguntarlo.
  const presetTrip = presetTripId ? trips?.find(t => t.id === presetTripId) : undefined
  const hayGuias = (guides?.length ?? 0) > 0
  // El paso «Viaje» se salta si el viaje ya viene dado y no hay ciudad que elegir.
  const conPasoViaje = !presetTripId || hayGuias

  // Lee un enlace o un texto pegado. Cuando llega la interpretación, prepara la
  // búsqueda con el nombre + ciudad; si no se reconoció el local, deja la ciudad
  // puesta para que la persona solo tenga que añadir el nombre del sitio.
  const alLeer = {
    onSuccess: (g: SharedPlaceGuess) => {
      if (g.placeName) setQuery([g.placeName, g.city].filter(Boolean).join(' '))
      else if (g.city) setQuery(g.city + ' ')
    },
  }

  function leer(entrada: { url?: string; manualText?: string }) {
    autoSearched.current = false
    setGuideElegidaId(null)
    interpret.mutate(entrada, alLeer)
  }

  function leerEnlace(url: string) {
    setEnlace(url)
    setOtroEnlace(false)
    leer({ url })
  }

  // Lanza la interpretación en cuanto hay un enlace compartido (una sola vez).
  useEffect(() => {
    if (sharedUrl && !interpret.isPending && !interpret.data && !interpret.error) {
      interpret.mutate({ url: sharedUrl }, alLeer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl])

  // OJO con la cuota diaria de Google: UNA consulta por búsqueda (la automática
  // al leer el enlace, y luego solo las que la persona lance con «Buscar»).
  // Nada de buscar mientras se escribe.
  async function runSearch(q: string) {
    const text = q.trim()
    if (!text || !placesLib) return
    setSearching(true)
    try {
      // Ojo: 'id' NO va en fields (la API lo rechaza); `p.id` viene siempre.
      // Mismos campos que el buscador de ubicaciones que ya funciona, + types/rating.
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
      if (hits.length === 0) toast.error('No hemos encontrado el sitio. Prueba a cambiar la búsqueda.')
    } catch (err) {
      console.error('[share-import] searchByText falló:', err)
      setResults([]); setChosen(null)
      toast.error('No se pudo buscar en el mapa')
    } finally {
      setSearching(false)
      setBuscado(true)
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
      const guardado = await savePlace.mutateAsync({
        trip_id: tripId,
        google_place_id: chosen.place_id,
        name: chosen.name,
        address: chosen.address,
        lat: chosen.lat,
        lng: chosen.lng,
        category: chosen.category,
        rating: chosen.rating,
        notes: guess?.why ?? null,
        link: enlace || urlInput || null,
        collection: COLLECTION,
        guide_id: guideId || null,
      })
      setSavedPlaceId(guardado.id)
    } catch {
      /* el aviso de error ya lo lanza el hook */
    }
  }

  // Reintenta la interpretación con la misma entrada (para errores transitorios
  // como la saturación de la IA).
  function retryInterpret() {
    leer(enlace ? { url: enlace } : { manualText: manualText.trim() })
  }

  function interpretarTexto() {
    leer({ manualText: manualText.trim() })
  }

  // Volver al paso 1 con todo limpio.
  function empezarConOtro() {
    interpret.reset()
    autoSearched.current = false
    setOtroEnlace(true)
    setUrlInput('')
    setManualText('')
    setQuery(''); setResults([]); setChosen(null); setBuscado(false)
    setEligiendoViaje(false)
  }

  // --- En qué paso estamos (se deduce del estado, no se guarda aparte) -------
  const leyendo = interpret.isPending || (!!sharedUrl && !otroEnlace && !guess && !interpret.error)
  const lecturaFallida = !interpret.isPending && (!!interpret.error || !!guess?.needsManualText)
  const paso: Paso =
    savedPlaceId ? 'guardado'
      : leyendo || lecturaFallida ? 'leer'
        : !guess ? 'enlace'
          : eligiendoViaje && conPasoViaje ? 'viaje'
            : 'sitio'
  const pasos: Paso[] = conPasoViaje
    ? ['enlace', 'leer', 'sitio', 'viaje', 'guardado']
    : ['enlace', 'leer', 'sitio', 'guardado']
  const tripElegido = trips?.find(t => t.id === tripId)

  // Sin ningún viaje no hay dónde guardar: se dice antes de hacer trabajar a nadie.
  if (!cargandoViajes && trips && trips.length === 0) {
    return (
      <Empty
        icon={Plane}
        title="Primero crea un viaje"
        description="Los sitios que importas se guardan dentro de un viaje. Crea uno y vuelve aquí."
      >
        <Button asChild variant="primary">
          <Link to="/dashboard">Ir a mis viajes</Link>
        </Button>
      </Empty>
    )
  }

  return (
    <div>
      <Pasos pasos={pasos} actual={paso} />

      {/* --- 1. Pegar el enlace ------------------------------------------- */}
      {paso === 'enlace' && (
        <Card pad="lg">
          <form
            className="space-y-5"
            onSubmit={e => { e.preventDefault(); if (urlInput.trim()) leerEnlace(urlInput.trim()) }}
          >
            <div>
              <h2 className="title-section">Pega el enlace</h2>
              <p className="mt-1 text-[0.9375rem] text-muted-foreground">
                Puede ser un vídeo de TikTok o Instagram, o una página web. Nosotros buscamos de qué sitio habla.
              </p>
            </div>
            <Field label="Enlace" hint="En la app del vídeo, pulsa «Compartir» y luego «Copiar enlace».">
              <Input
                type="url"
                inputMode="url"
                autoFocus
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Button type="submit" variant="primary" block disabled={!urlInput.trim()}>
              <Sparkles aria-hidden="true" />
              Leer el enlace
            </Button>
          </form>
          {presetTrip && (
            <p className="mt-4 text-sm text-muted-foreground">
              Se guardará en <span className="font-medium text-foreground">{presetTrip.name}</span>.
            </p>
          )}
        </Card>
      )}

      {/* --- 2. Leyendo el enlace ----------------------------------------- */}
      {paso === 'leer' && leyendo && (
        <Card pad="lg" className="text-center" aria-busy="true">
          <Spinner className="mx-auto size-8" label="Leyendo el enlace" />
          <h2 className="title-section mt-4">Leyendo el enlace…</h2>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">
            Estamos entendiendo de qué sitio habla. Suele tardar unos segundos.
          </p>
          <Skeleton className="mt-6 h-20 w-full" />
        </Card>
      )}

      {/* --- 2 bis. No se pudo leer (IA saturada) o Instagram sin texto ---- */}
      {paso === 'leer' && !leyendo && lecturaFallida && (
        <Card pad="lg" className="space-y-5">
          <div>
            <h2 className="title-section">
              {interpret.error ? 'No hemos podido leer el enlace' : 'Pega el texto del vídeo'}
            </h2>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">
              {interpret.error
                ? 'Puedes volver a intentarlo o pegar tú la descripción del vídeo.'
                : 'Instagram no nos deja leer el texto. Copia la descripción de la publicación (el nombre del sitio y dónde está) y pégala aquí.'}
            </p>
          </div>

          {/* Errores transitorios (IA saturada): reintentar con la misma entrada. */}
          {interpret.error && (
            <Notice
              tone="warning"
              icon={TriangleAlert}
              title={interpret.error.message}
              action={
                <Button variant="outline" size="sm" onClick={retryInterpret}>
                  <RotateCcw aria-hidden="true" />
                  Reintentar
                </Button>
              }
            />
          )}

          {guess?.thumbnailUrl && (
            <img src={guess.thumbnailUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
          )}

          {/* Alternativa siempre disponible: pegar el texto del vídeo a mano. */}
          <Field label="Descripción del vídeo">
            <Textarea
              rows={4}
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder="Ej.: El mejor ramen de Tokio está en Ichiran, Shibuya…"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Button variant="primary" block disabled={!manualText.trim()} onClick={interpretarTexto}>
              <Sparkles aria-hidden="true" />
              Leer este texto
            </Button>
            <Button variant="ghost" block onClick={empezarConOtro}>
              <ArrowLeft aria-hidden="true" />
              Usar otro enlace
            </Button>
          </div>
        </Card>
      )}

      {/* --- 3. ¿Es este sitio? ------------------------------------------- */}
      {paso === 'sitio' && (
        <div className="space-y-5">
          <div>
            <h2 className="title-section">¿Es este sitio?</h2>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">
              {guess?.placeName
                ? 'Esto es lo que hemos entendido. Si no es el sitio correcto, cambia la búsqueda.'
                : 'No hemos podido leer el nombre del sitio (a veces solo se dice hablando en el vídeo). Escríbelo y lo buscamos.'}
            </p>
          </div>

          {guess?.why && <Notice tone="primary" icon={Sparkles}>{guess.why}</Notice>}

          <form
            className="flex items-end gap-2"
            onSubmit={e => { e.preventDefault(); void runSearch(query) }}
          >
            <Field label="Nombre del sitio y ciudad" className="min-w-0 flex-1">
              <Input
                autoFocus={!guess?.placeName}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ej.: Ichiran Shibuya Tokio"
                enterKeyHint="search"
              />
            </Field>
            <Button type="submit" variant="secondary" loading={searching} disabled={!query.trim() || !placesLib}>
              {!searching && <Search aria-hidden="true" />}
              Buscar
            </Button>
          </form>

          {searching && !results.length ? (
            <Skeleton className="h-20 w-full" />
          ) : results.length > 0 ? (
            <>
              <Card pad="none" className="divide-y divide-border overflow-hidden" role="radiogroup" aria-label="Sitios encontrados">
                {results.map(r => {
                  const active = chosen?.place_id === r.place_id
                  return (
                    <button
                      key={r.place_id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setChosen(r)}
                      className={cn(
                        'flex min-h-15 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150',
                        active ? 'bg-primary-soft' : 'hover:bg-secondary/70',
                      )}
                    >
                      {r.photoUrl ? (
                        <img src={r.photoUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span data-tone={r.category} className="grid size-12 shrink-0 place-items-center rounded-xl bg-tone-soft text-tone">
                          <PlaceIcon category={r.category} className="size-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">{r.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {PLACE_CATEGORY_LABELS[r.category]}{r.address ? ` · ${r.address}` : ''}
                        </span>
                      </span>
                      {r.rating != null && (
                        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                          <Star className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Valoración:</span>
                          {r.rating.toFixed(1)}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-full border-2',
                          active ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                        )}
                      >
                        {active && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </Card>
              {chosen && <MapaDelSitio sitio={chosen} />}
            </>
          ) : buscado ? (
            <Empty
              bare
              icon={MapPin}
              title="No hemos encontrado ese sitio"
              description="Prueba con el nombre exacto y la ciudad, y pulsa «Buscar»."
            />
          ) : null}

          {enlace && (
            <a
              href={enlace}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Ver el vídeo o la página original
            </a>
          )}

          {!conPasoViaje && presetTrip && (
            <p className="text-sm text-muted-foreground">
              Se guardará en <span className="font-medium text-foreground">{presetTrip.name}</span>.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {conPasoViaje ? (
              <Button variant="primary" block disabled={!chosen} onClick={() => setEligiendoViaje(true)}>
                Sí, es este
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button variant="primary" block disabled={!chosen || !tripId} loading={savePlace.isPending} onClick={save}>
                {!savePlace.isPending && <MapPin aria-hidden="true" />}
                Sí, guardarlo en el viaje
              </Button>
            )}
            <Button variant="ghost" block onClick={empezarConOtro}>
              <ArrowLeft aria-hidden="true" />
              Usar otro enlace
            </Button>
          </div>
        </div>
      )}

      {/* --- 4. Viaje y ciudad -------------------------------------------- */}
      {paso === 'viaje' && chosen && (
        <div className="space-y-5">
          <div>
            <h2 className="title-section">{presetTripId ? '¿En qué ciudad lo guardamos?' : '¿En qué viaje lo guardamos?'}</h2>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">
              Vas a guardar <span className="font-medium text-foreground">{chosen.name}</span> en tus lugares.
            </p>
          </div>

          <Card className="space-y-4">
            {/* El viaje solo se pregunta si NO se abrió ya desde un viaje concreto. */}
            {presetTripId ? (
              presetTrip && (
                <p className="text-[0.9375rem] text-muted-foreground">
                  Viaje: <span className="font-medium text-foreground">{presetTrip.name}</span>
                </p>
              )
            ) : (
              <Field label="Viaje">
                <Select value={tripId} onChange={e => { setTripElegidoId(e.target.value); setGuideElegidaId(null) }}>
                  {(trips ?? []).map(t => <option key={t.id} value={t.id}>{t.name} · {t.destination}</option>)}
                </Select>
              </Field>
            )}

            {hayGuias && (
              <Field label="Ciudad" hint="El sitio aparecerá en la guía de esa ciudad." optional>
                <Select value={guideId} onChange={e => setGuideElegidaId(e.target.value)}>
                  <option value="">Sin ciudad</option>
                  {guides!.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </Field>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            <Button variant="primary" block disabled={!tripId} loading={savePlace.isPending} onClick={save}>
              {!savePlace.isPending && <MapPin aria-hidden="true" />}
              Guardar en el viaje
            </Button>
            <Button variant="ghost" block onClick={() => setEligiendoViaje(false)}>
              <ArrowLeft aria-hidden="true" />
              Volver al sitio
            </Button>
          </div>
        </div>
      )}

      {/* --- 5. Guardado --------------------------------------------------- */}
      {paso === 'guardado' && (
        <Card pad="lg" className="text-center">
          <span data-tone="success" className="mx-auto grid size-16 place-items-center rounded-full bg-tone-soft text-tone">
            <CircleCheck className="size-8" aria-hidden="true" />
          </span>
          <h2 className="title-section mt-4">Guardado</h2>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">
            <span className="font-medium text-foreground">{chosen?.name}</span> ya está en los lugares
            {tripElegido ? <> de <span className="font-medium text-foreground">{tripElegido.name}</span></> : ' del viaje'}.
          </p>
          {chosen && (
            <p className="mt-3 flex justify-center">
              <Badge tone={chosen.category}>{PLACE_CATEGORY_LABELS[chosen.category]}</Badge>
            </p>
          )}
          <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
            <Button
              variant="primary"
              block
              onClick={() => navigate(`/trips/${tripId}/itinerary?tab=ideas&place=${savedPlaceId}&anadir=1`)}
            >
              <CalendarPlus aria-hidden="true" />
              Añadir al plan
            </Button>
            <Button variant="outline" block onClick={() => navigate(`/trips/${tripId}/itinerary?tab=ideas`)}>
              Ver mis lugares
            </Button>
          </div>
        </Card>
      )}

      {paso === 'enlace' && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4" aria-hidden="true" />
          Solo leemos el enlace que pegues; no se publica nada.
        </p>
      )}
    </div>
  )
}

/** Mapa pequeño con el sitio elegido, para comprobar de un vistazo que es ese. */
function MapaDelSitio({ sitio }: { sitio: Candidate }) {
  const theme = useA11yStore(s => s.theme)
  const colorScheme =
    theme === 'dark' ? ColorScheme.DARK : theme === 'light' ? ColorScheme.LIGHT : ColorScheme.FOLLOW_SYSTEM
  return (
    <Card pad="none" className="h-52 overflow-hidden">
      <Map
        defaultCenter={{ lat: sitio.lat, lng: sitio.lng }}
        defaultZoom={15}
        mapId="wanderlog-map"
        colorScheme={colorScheme}
        gestureHandling="cooperative"
        disableDefaultUI
        className="size-full"
      >
        <Centrar lat={sitio.lat} lng={sitio.lng} />
        <AdvancedMarker position={{ lat: sitio.lat, lng: sitio.lng }} title={sitio.name}>
          <span data-tone={sitio.category} className="grid size-9 place-items-center rounded-full border-2 border-card bg-tone text-background shadow-raised">
            <PlaceIcon category={sitio.category} className="size-4.5" />
          </span>
        </AdvancedMarker>
      </Map>
    </Card>
  )
}

// El mapa se monta una vez y se mueve al cambiar de candidato: volver a
// montarlo contaría como otra carga de mapa en Google.
function Centrar({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map?.panTo({ lat, lng }) }, [map, lat, lng])
  return null
}
