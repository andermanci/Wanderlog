import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripHeader } from '@/components/trips/TripHeader'
import { useActivities } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { useAuthStore } from '@/store/authStore'
import { cn, ACTIVITY_COLORS } from '@/lib/utils'
import {
  AUDIOGUIDE_DETAIL_LEVELS, buildAudioguidePrompt, type AudioguideDetailLevel,
} from '@/lib/audioguide/buildPrompt'
import { AUDIOGUIDE_AI_PROVIDERS, type AudioguideAiProvider } from '@/lib/audioguide/aiProviders'
import { parseAudioguideText } from '@/lib/audioguide/parseAudioguideText'
import { loadAudioguideDraft, saveAudioguideDraft, clearAudioguideDraft } from '@/lib/audioguide/draft'
import { isStandalonePwa } from '@/hooks/usePwaInstall'
import {
  useAudioguide, useCreateAudioguide, useGenerateStopAudio, useDeleteAudioguide,
} from '@/lib/queries/audioguides'
import { AudioguidePlayer } from '@/components/itinerary/AudioguidePlayer'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { toast } from 'sonner'

// Pantalla propia de la audioguía: solo se llega aquí desde el botón dentro
// del detalle de la actividad (no hay ningún enlace de navegación general).
export function AudioguidePage() {
  const { tripId, activityId } = useParams<{ tripId: string; activityId: string }>()
  const { user } = useAuthStore()
  const { data: activities, isLoading: loadingActivity } = useActivities(tripId!)
  const { data: trip } = useTrip(tripId!)
  const activity = activities?.find((a) => a.id === activityId)

  const { data: audioguide, isLoading } = useAudioguide(activityId!)
  const createAudioguide = useCreateAudioguide(tripId!, activityId!)
  const generateStopAudio = useGenerateStopAudio(tripId!, activityId!)
  const deleteAudioguide = useDeleteAudioguide(tripId!, activityId!)

  // Si iOS mató la PWA mientras estabas en la app de la IA, el borrador
  // devuelve el flujo al punto exacto (cuadro de pegado y texto incluidos).
  const draft = useMemo(() => {
    const d = loadAudioguideDraft()
    return d && d.activityId === activityId ? d : null
  }, [activityId])

  const [detailLevel, setDetailLevel] = useState<AudioguideDetailLevel>(draft?.detailLevel ?? 'estandar')
  const [aiProvider, setAiProvider] = useState<AudioguideAiProvider>(draft?.provider ?? 'claude')
  const [showPasteBox, setShowPasteBox] = useState(!!draft)
  const [pastedText, setPastedText] = useState(draft?.pastedText ?? '')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (loadingActivity || isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Skeleton className="h-10 w-2/3" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-48 w-full" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  if (!activity || !trip || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <TripHeader tripId={tripId!} section="Audioguía" />
        <p className="text-muted-foreground py-12 text-center">Actividad no encontrada.</p>
      </div>
    )
  }

  const color = ACTIVITY_COLORS[activity.type]
  const provider = AUDIOGUIDE_AI_PROVIDERS.find((p) => p.id === aiProvider) ?? AUDIOGUIDE_AI_PROVIDERS[0]

  const copyPrompt = async () => {
    const prompt = buildAudioguidePrompt(activity, trip, detailLevel)
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success(`Prompt copiado ✓ — pégalo (Cmd/Ctrl+V) en el cuadro de mensaje de ${provider.label} y envíalo.`)
    } catch {
      toast.error('No se pudo copiar automáticamente. Pulsa "Copiar prompt de nuevo" para reintentarlo.')
    }
  }

  // En la PWA instalada de iOS, window.open abre un navegador embebido que se
  // queda en blanco (con una X) cuando el enlace universal salta a la app de
  // la IA. Instalada: no abrimos nada; el usuario cambia de app él mismo.
  const standalone = isStandalonePwa()

  const persistDraft = (pasted: string) => {
    saveAudioguideDraft({
      tripId: tripId!, activityId: activityId!, activityTitle: activity.title,
      provider: aiProvider, detailLevel, pastedText: pasted,
    })
  }

  const handleStartGeneration = async () => {
    await copyPrompt()
    if (!standalone) window.open(provider.url, '_blank')
    persistDraft('')
    setShowPasteBox(true)
  }

  const handleProcess = async () => {
    let parsedStops
    try {
      parsedStops = parseAudioguideText(pastedText)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo interpretar el texto')
      return
    }

    setProcessing(true)
    setProgress({ done: 0, total: parsedStops.length })
    try {
      const created = await createAudioguide.mutateAsync({ rawText: pastedText, parsedStops })

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
            await generateStopAudio.mutateAsync({ stop, userId: user.id })
          } catch (err) {
            errors.push(err instanceof Error ? err.message : 'Error desconocido')
          }
          done++
          setProgress({ done, total: created.stops.length })
        }
      }))

      if (errors.length > 0) {
        toast.error(`${errors.length} de ${created.stops.length} paradas fallaron. Puedes reintentarlas desde "Regenerar".`)
      } else {
        toast.success('Audioguía generada')
      }
      clearAudioguideDraft()
      setShowPasteBox(false)
      setPastedText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error generando la audioguía')
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  const stops = audioguide?.stops ?? []
  const allReady = stops.length > 0 && stops.every((s) => s.status === 'ready')
  const anyError = stops.some((s) => s.status === 'error')

  // Progreso a mostrar: el de la generación en curso en esta página, o (si
  // se recarga la página a medias) el que se deduce de las paradas ya listas.
  const displayProgress = processing
    ? progress
    : audioguide && !allReady && !anyError
      ? { done: stops.filter((s) => s.status === 'ready').length, total: stops.length }
      : null

  const loaderBlock = (
    <div className="flex flex-col items-center gap-2 py-6">
      <Loader2 size={26} className="animate-spin" style={{ color: 'var(--primary)' }} />
      <p className="text-sm font-medium">Generando audioguía…</p>
      {displayProgress && displayProgress.total > 0 && (
        <>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((displayProgress.done / displayProgress.total) * 100)}%`,
                background: 'var(--primary)',
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{displayProgress.done} de {displayProgress.total} paradas listas</p>
        </>
      )}
    </div>
  )

  // Orden de prioridad: lista si ya está todo listo; loader mientras se está
  // generando (con o sin fila de audioguide ya creada en BD); error si terminó
  // con fallos; formulario de pegado; o el punto de partida.
  let body: React.ReactNode
  if (allReady && audioguide) {
    body = <AudioguidePlayer stops={stops} audioguideId={audioguide.id} />
  } else if (processing) {
    body = loaderBlock
  } else if (audioguide) {
    body = anyError
      ? <p className="text-sm text-muted-foreground">Hubo un error generando algún audio de la audioguía.</p>
      : loaderBlock
  } else if (showPasteBox) {
    body = (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground space-y-1 rounded-md p-2.5" style={{ background: 'var(--secondary)' }}>
          {standalone ? (
            <p>1. Cambia a la app de {provider.label} (o ábrela en tu navegador) y pega el prompt en el cuadro de mensaje — ya está en tu portapapeles. Tranquilo si esta app se reinicia al volver: retomarás donde estabas.</p>
          ) : (
            <p>1. En la pestaña de {provider.label} que se ha abierto, pulsa dentro del cuadro de mensaje y pega con <strong>Cmd+V</strong> (o <strong>Ctrl+V</strong> en Windows) — el prompt ya está en tu portapapeles.</p>
          )}
          <p>2. Envíalo y espera a que {provider.label} te devuelva el guion.</p>
          <p>3. Copia toda su respuesta y pégala aquí abajo.</p>
        </div>
        <button
          type="button"
          onClick={copyPrompt}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Copy size={12} /> Copiar prompt de nuevo
        </button>
        <Textarea
          value={pastedText}
          onChange={(e) => { setPastedText(e.target.value); persistDraft(e.target.value) }}
          placeholder="###PARADA### ..."
          rows={8}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleProcess} disabled={!pastedText.trim()} className="gap-2">
            <Sparkles size={15} /> Procesar guion
          </Button>
          <Button variant="ghost" onClick={() => { clearAudioguideDraft(); setShowPasteBox(false); setPastedText('') }}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Genera una audioguía con paradas y narración para visitar este lugar.
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Generar con</p>
          <div className="flex flex-wrap gap-1.5">
            {AUDIOGUIDE_AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAiProvider(p.id)}
                className={cn(
                  'text-sm font-medium px-3 py-1.5 rounded-md border transition-colors',
                  aiProvider === p.id ? 'border-primary' : 'border-border hover:border-primary/50',
                )}
                style={{ background: aiProvider === p.id ? 'var(--secondary)' : 'transparent' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Nivel de detalle</p>
          {AUDIOGUIDE_DETAIL_LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => setDetailLevel(lvl.id)}
              className={cn(
                'w-full text-left rounded-md p-2.5 border transition-colors',
                detailLevel === lvl.id ? 'border-primary' : 'border-border hover:border-primary/50',
              )}
              style={{ background: detailLevel === lvl.id ? 'var(--secondary)' : 'transparent' }}
            >
              <p className="text-sm font-medium flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full shrink-0', detailLevel === lvl.id ? 'bg-primary' : 'bg-border')} />
                {lvl.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{lvl.description}</p>
            </button>
          ))}
        </div>
        <Button onClick={handleStartGeneration} className="gap-2">
          <Sparkles size={15} /> Generar guion con {provider.label}
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Audioguía" />

      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <BackButton to={`/trips/${tripId}/itinerary/${activityId}`}>Actividad</BackButton>
          {audioguide && !processing && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
            >
              <RefreshCw size={12} /> Regenerar
            </button>
          )}
        </div>

        <h1 className="font-serif text-2xl sm:text-3xl font-medium flex items-start gap-2.5 break-words leading-tight">
          <span className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `${color}1f` }}>
            <ActivityIcon type={activity.type} size={20} style={{ color }} />
          </span>
          <span className="min-w-0">Audioguía · {activity.title}</span>
        </h1>
      </div>

      {body}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Regenerar audioguía?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la audioguía actual y sus audios. Podrás generar una nueva desde cero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (audioguide) deleteAudioguide.mutate({ audioguideId: audioguide.id, userId: user.id })
                setConfirmDelete(false)
              }}
            >
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
