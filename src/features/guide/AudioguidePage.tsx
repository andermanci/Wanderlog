import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { APIProvider, useApiIsLoaded } from '@vis.gl/react-google-maps'
import { Check, CircleAlert, Headphones, RefreshCw, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button, Confirm, Empty, Menu, Notice, Page, Progress, Skeleton, Spinner,
} from '@/design'
import { cn } from '@/lib/utils'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { useAuthStore } from '@/store/authStore'
import { fallbackCover } from '@/lib/coverFallbacks'
import { citiesLabel } from '@/lib/cities'
import {
  buildAudioguidePrompt, buildDayAudioguidePrompt, detailLevelsFor,
  type AudioguideDetailLevel,
} from '@/lib/audioguide/buildPrompt'
import { parseAudioguideText, type ParsedAudioguideStop } from '@/lib/audioguide/parseAudioguideText'
import { loadAudioguideDraft, saveAudioguideDraft, clearAudioguideDraft } from '@/lib/audioguide/draft'
import { scopeKey, scopeRoute, type AudioguideScope } from '@/lib/audioguide/scope'
import { isStandalonePwa } from '@/hooks/usePwaInstall'
import {
  useAudioguide, useCreateAudioguide, useGenerateStopAudio, useDeleteAudioguide,
} from '@/lib/queries/audioguides'
import {
  useBackfillStopLocations, activityGeocodeContext, dayGeocodeContext,
} from '@/lib/queries/audioguideStopLocations'
import { AiExchange, type AiProvider } from '@/features/ai-exchange/AiExchange'
import type { AudioguideStop } from '@/types/database'
import { AudioguidePlayerView } from './AudioguidePlayerView'
import { PlaybackHost } from './PlaybackHost'
import { usePlaybackStore } from './playbackStore'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

// Cómo va el audio de una parada mientras se crean: con icono Y texto.
function StopStatus({ status }: { status: AudioguideStop['status'] }) {
  if (status === 'ready') {
    return (
      <span data-tone="success" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-tone">
        <span className="grid size-5 place-items-center rounded-full bg-tone-soft"><Check className="size-3.5" aria-hidden="true" /></span>
        Lista
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span data-tone="danger" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-tone">
        <CircleAlert className="size-4" aria-hidden="true" /> Ha fallado
      </span>
    )
  }
  if (status === 'generating') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Spinner className="size-4" label="Creando el audio" /> Creando…
      </span>
    )
  }
  return <span className="shrink-0 text-xs text-muted-foreground">En espera</span>
}

// Situar las paradas en el mapa necesita el Geocoder de Google Maps, que a su
// vez necesita un <APIProvider> ancestro: de ahí este envoltorio.
export function AudioguidePage() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <AudioguidePageInner />
    </APIProvider>
  )
}

// Pantalla propia de la audioguía. Sirve para los dos ámbitos: la audioguía de
// una actividad, a la que se llega desde su detalle, y la de la ciudad de un
// día, a la que se llega desde el día o desde la guía. Todo lo que cambia entre
// uno y otro se resuelve una vez en `sujeto`; de ahí para abajo la pantalla es
// la misma.
function AudioguidePageInner() {
  const { tripId, activityId, dayId } = useParams<{ tripId: string; activityId?: string; dayId?: string }>()
  const { user } = useAuthStore()
  const { data: activities, isLoading: loadingActivities } = useActivities(tripId!)
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: trip } = useTrip(tripId!)
  const { data: role } = useTripRole(tripId!)
  const canEdit = canEditRole(role)

  // Memoizado porque va en las dependencias del efecto de useBackfillStopLocations.
  const scope = useMemo<AudioguideScope | null>(
    () => (activityId ? { kind: 'activity', id: activityId } : dayId ? { kind: 'day', id: dayId } : null),
    [activityId, dayId],
  )

  const activity = activityId ? activities?.find((a) => a.id === activityId) : undefined
  const day = dayId ? days?.find((d) => d.id === dayId) : undefined
  const dayActivities = useMemo(
    () => (dayId ? (activities ?? []).filter((a) => a.day_id === dayId) : []),
    [activities, dayId],
  )

  const { data: audioguide, isLoading } = useAudioguide(scope)
  const createAudioguide = useCreateAudioguide(tripId!, scope!)
  const generateStopAudio = useGenerateStopAudio(scope!)
  const deleteAudioguide = useDeleteAudioguide(scope!)

  // Si iOS mató la PWA mientras estabas en la app de la IA, el borrador
  // devuelve el flujo al punto exacto (IA elegida y texto pegado incluidos).
  const [draft, setDraft] = useState(() => {
    const d = loadAudioguideDraft()
    return d && scope && scopeKey(d.scope) === scopeKey(scope) ? d : null
  })
  // Cambia para volver a montar el asistente en blanco («Empezar de cero»).
  const [intento, setIntento] = useState(0)

  const [detailLevel, setDetailLevel] = useState<AudioguideDetailLevel>(draft?.detailLevel ?? 'estandar')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Lo último escrito en el asistente, para poder guardarlo al salir de la app.
  const borradorRef = useRef<{ text: string; provider: AiProvider }>({
    text: draft?.pastedText ?? '', provider: draft?.provider ?? 'claude',
  })

  // Todo lo que distingue una audioguía de sitio de una de ciudad, en un sitio.
  const sujeto = useMemo(() => {
    if (!trip) return null
    if (scope?.kind === 'day') {
      if (!day) return null
      const ciudades = citiesLabel(day)
      const fecha = format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })
      return {
        kind: 'day' as const,
        // Sin ciudades escritas, el destino del viaje es el mejor título posible.
        title: ciudades ?? trip.destination,
        subtitle: `Audioguía de la ciudad · ${fecha}`,
        back: { to: `/trips/${tripId}/itinerary?day=${day.id}`, label: 'Plan del día' },
        intro: 'Una audioguía para pasear por la ciudad: su historia, sus barrios y por qué es como es.',
        coverUrl: trip.cover_image_url ?? fallbackCover(trip.id),
        prompt: () => buildDayAudioguidePrompt(day, trip, dayActivities, detailLevel),
        geo: dayGeocodeContext(day, trip),
      }
    }
    if (!activity) return null
    return {
      kind: 'activity' as const,
      title: activity.title,
      subtitle: 'Audioguía del sitio',
      back: { to: `/trips/${tripId}/itinerary/${activity.id}`, label: 'Actividad' },
      intro: 'Una audioguía con paradas y narración para visitar este sitio a tu ritmo.',
      // La foto del sitio en la pantalla de bloqueo. La portada de reserva va
      // empaquetada en el build, así que también se ve sin conexión.
      coverUrl: activity.cover_image_url ?? trip.cover_image_url ?? fallbackCover(trip.id),
      prompt: () => buildAudioguidePrompt(activity, trip, detailLevel),
      geo: activityGeocodeContext(activity, trip),
    }
  }, [scope, trip, day, activity, dayActivities, detailLevel, tripId])

  // Las paradas sin coordenadas (las audioguías creadas antes de que existiera
  // el mapa) se geocodifican una vez y se guardan; a partir de ahí llegan ya
  // localizadas desde la base de datos.
  const rawStops = useMemo(() => audioguide?.stops ?? [], [audioguide])
  const mapsReady = useApiIsLoaded()
  const ancla = useMemo(() => sujeto?.geo.punto ?? null, [sujeto])
  const { stops, locating } = useBackfillStopLocations(
    scope, rawStops, sujeto?.geo.contexto ?? '', ancla, mapsReady,
  )

  const allReady = stops.length > 0 && stops.every((s) => s.status === 'ready')
  const anyError = stops.some((s) => s.status === 'error')

  // Con la audioguía lista, se carga en el reproductor de la app (el que
  // sobrevive al cambiar de pantalla). Si ya era esta, solo refresca sus datos.
  const audioguideId = audioguide?.id
  const sujetoTitle = sujeto?.title
  const sujetoCover = sujeto?.coverUrl ?? null
  useEffect(() => {
    if (!allReady || !audioguideId || !sujetoTitle || !scope || !tripId) return
    usePlaybackStore.getState().open({
      audioguideId, stops, title: sujetoTitle, coverUrl: sujetoCover, route: scopeRoute(tripId, scope),
    })
  }, [allReady, audioguideId, stops, sujetoTitle, sujetoCover, scope, tripId])
  const playback = usePlaybackStore(s => (s.api && s.api.audioguideId === audioguideId ? s.api : null))

  // Guardar el borrador al salir de la app: es el instante antes de que iOS
  // pueda matar la PWA mientras estás en la app de la IA. En el navegador solo
  // se guarda si ya has pegado algo (ahí la pestaña no se pierde).
  const generando = !!sujeto && !!scope && canEdit && !audioguide && !processing && !isLoading
  useEffect(() => {
    if (!generando || !sujeto || !scope) return
    const guardar = () => {
      const { text, provider } = borradorRef.current
      if (!text.trim() && !isStandalonePwa()) return
      saveAudioguideDraft({ tripId: tripId!, scope, title: sujeto.title, provider, detailLevel, pastedText: text })
    }
    const alOcultar = () => { if (document.visibilityState === 'hidden') guardar() }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', guardar)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', guardar)
    }
  }, [generando, sujeto, scope, tripId, detailLevel])

  if (loadingActivities || loadingDays || isLoading) {
    return (
      <Page width="narrow">
        <div className="space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Page>
    )
  }

  if (!sujeto || !scope || !trip || !user) {
    return (
      <Page width="narrow">
        <Empty
          icon={SearchX}
          title={scope?.kind === 'day' ? 'No encontramos ese día' : 'No encontramos esa actividad'}
          description="Puede que se haya borrado o que el enlace esté mal. Desde la guía tienes todas las audioguías del viaje."
        >
          <Button variant="primary" asChild><Link to={`/trips/${tripId}/guide`}>Ir a la guía</Link></Button>
        </Empty>
      </Page>
    )
  }

  const detailLevels = detailLevelsFor(sujeto.kind)

  const handleDraftChange = ({ text, provider }: { text: string; provider: AiProvider }) => {
    borradorRef.current = { text, provider }
    saveAudioguideDraft({ tripId: tripId!, scope, title: sujeto.title, provider, detailLevel, pastedText: text })
  }

  const empezarDeCero = () => {
    clearAudioguideDraft()
    borradorRef.current = { text: '', provider: 'claude' }
    setDraft(null)
    setIntento(n => n + 1)
  }

  const handleProcess = async (parsedStops: ParsedAudioguideStop[], rawText: string) => {
    setProcessing(true)
    setProgress({ done: 0, total: parsedStops.length })
    try {
      const created = await createAudioguide.mutateAsync({ rawText, parsedStops })

      // Genera los audios con varias peticiones en paralelo (más rápido con
      // muchas paradas), pero limitando la concurrencia para no saturar la
      // API de Google TTS.
      const CONCURRENCY = 3
      let done = 0
      let cursor = 0
      const errors: string[] = []
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < created.stops.length) {
          const stop = created.stops[cursor++]
          try {
            await generateStopAudio.mutateAsync({ stop })
          } catch (err) {
            errors.push(err instanceof Error ? err.message : 'Error desconocido')
          }
          done++
          setProgress({ done, total: created.stops.length })
        }
      }))

      if (errors.length > 0) {
        toast.error(`${errors.length} de ${created.stops.length} paradas han fallado. Pulsa «Regenerar» para volver a intentarlo.`)
      } else {
        toast.success('Audioguía lista')
      }
      clearAudioguideDraft()
      borradorRef.current = { text: '', provider: 'claude' }
      setDraft(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido crear la audioguía')
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  // Progreso a mostrar: el de la generación en curso en esta página, o (si
  // se recarga la página a medias) el que se deduce de las paradas ya listas.
  const displayProgress = processing
    ? progress
    : audioguide && !allReady && !anyError
      ? { done: stops.filter((s) => s.status === 'ready').length, total: stops.length }
      : null

  const hechas = displayProgress?.done ?? 0
  const totales = displayProgress?.total ?? 0
  // La barra global arriba y, debajo, las paradas que se van completando.
  const loaderBlock = (
    <div className="space-y-6">
      <div className="rounded-2xl bg-primary-soft p-5 md:p-6" aria-live="polite">
        <p className="eyebrow flex items-center gap-2">
          <Spinner className="size-4" label="Creando los audios" /> Creando los audios
        </p>
        {totales > 0 && (
          <>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-5xl font-medium leading-none tracking-tight tabular-nums text-accent-foreground">{hechas}</span>
              <span className="text-[0.9375rem] tabular-nums text-muted-foreground">
                de {totales} {totales === 1 ? 'parada lista' : 'paradas listas'}
              </span>
            </p>
            <Progress
              className="mt-4 h-2.5"
              value={(hechas / totales) * 100}
              label="Paradas con el audio listo"
            />
          </>
        )}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {processing
            ? 'No cierres esta pantalla hasta que termine. Suele tardar uno o dos minutos.'
            : 'Se está creando desde otro dispositivo. Aparecerá aquí en cuanto termine.'}
        </p>
      </div>

      {stops.length > 0 && (
        <ol aria-label="Paradas" className="divide-y divide-border border-y border-border">
          {stops.map((s, i) => (
            <li key={s.id} className="flex min-h-12 items-center gap-3 py-2.5">
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 font-serif text-base font-medium tracking-tight',
                  s.status === 'ready' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.title}
              </span>
              <StopStatus status={s.status} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  // Orden de prioridad: reproductor si ya está todo listo; progreso mientras se
  // está generando (con o sin fila de audioguía ya creada); error si terminó
  // con fallos; y si no hay nada, el asistente para crearla.
  const reproduciendo = allReady && !!audioguide
  let body: React.ReactNode
  if (reproduciendo) {
    body = playback
      ? <AudioguidePlayerView playback={playback} coverUrl={sujeto.coverUrl} locatingStops={locating} />
      : <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
  } else if (processing) {
    body = loaderBlock
  } else if (audioguide) {
    body = anyError ? (
      <Notice
        tone="danger" title="Algún audio no se ha podido crear"
        action={canEdit ? <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}><RefreshCw /> Regenerar</Button> : undefined}
      >
        {canEdit
          ? 'Vuelve a crear la audioguía desde cero: el guion se pega otra vez y los audios se generan de nuevo.'
          : 'Pide a quien organiza el viaje que la vuelva a crear.'}
      </Notice>
    ) : loaderBlock
  } else if (!canEdit) {
    body = (
      <Empty
        icon={Headphones} title="Todavía no hay audioguía"
        description="Quien puede editar el viaje puede crearla desde esta misma pantalla. Cuando esté lista, la podrás escuchar aquí."
      >
        <Button asChild><Link to={sujeto.back.to}>Volver</Link></Button>
      </Empty>
    )
  } else {
    body = (
      <div className="space-y-6">
        {/* Qué se va a crear */}
        <div className="flex items-start gap-4 rounded-2xl bg-primary-soft p-5 md:p-6">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-accent-foreground">
            <Headphones className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Vas a crear</p>
            <p className="mt-1 font-serif text-2xl font-medium leading-tight tracking-tight text-accent-foreground">
              {sujeto.kind === 'day' ? 'La audioguía de la ciudad' : 'La audioguía de este sitio'}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed">
              {sujeto.intro} El guion lo escribe la IA que tú elijas; después nosotros lo convertimos en audio.
            </p>
          </div>
        </div>
        {draft && (
          <Notice
            tone="info" title="Hemos recuperado lo que tenías a medias"
            action={<Button size="sm" variant="outline" onClick={empezarDeCero}>Empezar de cero</Button>}
          >
            Sigue donde lo dejaste: pega la respuesta de la IA en el paso 3.
          </Notice>
        )}
        <div className="border-t border-border pt-6">
          <AiExchange<ParsedAudioguideStop[]>
            key={`${scopeKey(scope)}:${intento}`}
            prompt={sujeto.prompt}
            fileName={`audioguia-${sujeto.title.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-').slice(0, 40)}.md`}
            initialProvider={draft?.provider}
            initialText={draft?.pastedText}
            onDraftChange={handleDraftChange}
            pastePlaceholder="###PARADA### …"
            parse={parseAudioguideText}
            options={
              <fieldset className="pt-2">
                <legend className="eyebrow mb-2">Nivel de detalle</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {detailLevels.map((lvl) => {
                    const elegido = detailLevel === lvl.id
                    return (
                      <label
                        key={lvl.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-150',
                          'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/20',
                          elegido ? 'border-primary bg-primary-soft' : 'border-border bg-transparent hover:bg-secondary',
                        )}
                      >
                        <input
                          type="radio" name="nivel-de-detalle" value={lvl.id} checked={elegido}
                          onChange={() => setDetailLevel(lvl.id)}
                          className="mt-0.5 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{lvl.label}</span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{lvl.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            }
            review={(parsed) => (
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="font-serif text-3xl font-medium leading-none tracking-tight tabular-nums">{parsed.length}</span>
                  <span className="text-sm text-muted-foreground">
                    {parsed.length === 1 ? 'parada en el guion' : 'paradas en el guion'}
                  </span>
                </p>
                <ol className="mt-3 max-h-56 divide-y divide-border overflow-y-auto border-y border-border">
                  {parsed.map((s, i) => (
                    <li key={i} className="flex items-baseline gap-3 py-2">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 font-serif text-[0.9375rem] font-medium tracking-tight">{s.title}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  Al guardar se crea el audio de cada parada. Tarda uno o dos minutos.
                </p>
              </div>
            )}
            saveLabel="Crear los audios"
            saving={processing}
            onSave={(parsed, rawText) => handleProcess(parsed, rawText)}
          />
        </div>
      </div>
    )
  }

  return (
    <Page
      width={reproduciendo ? 'wide' : 'narrow'}
      back={sujeto.back}
      title={sujeto.title}
      subtitle={sujeto.subtitle}
      actions={canEdit && audioguide && !processing ? (
        <Menu
          label="Opciones de la audioguía" triggerSize="md" triggerVariant="secondary"
          items={[{
            label: 'Regenerar', icon: RefreshCw, danger: true,
            hint: 'Borra esta audioguía y crea otra',
            onSelect: () => setConfirmDelete(true),
          }]}
        />
      ) : undefined}
    >
      {/* Dueño del audio de reserva: solo actúa si el armazón no trae el suyo. */}
      <PlaybackHost />

      {body}

      <Confirm
        danger
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Regenerar la audioguía?"
        description="Se borran la audioguía actual y sus audios. Después podrás crear una nueva desde cero."
        confirmLabel="Borrar y regenerar"
        loading={deleteAudioguide.isPending}
        onConfirm={() => {
          if (audioguide) {
            const id = audioguide.id
            // Al borrarse, también se descarga del reproductor (y de la barra pequeña).
            deleteAudioguide.mutate({ audioguideId: id }, {
              onSuccess: () => usePlaybackStore.getState().close(id),
            })
          }
          setConfirmDelete(false)
        }}
      />
    </Page>
  )
}
