import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, CheckCircle2, WifiOff, Headphones, Images, Trash2 } from 'lucide-react'
import {
  prefetchTripOffline, tripDownloadSummary,
  type DownloadSummary, type PrefetchProgress,
} from '@/lib/offlineTrip'
import { deleteTripOffline, describeOfflineIndex, readOfflineIndex } from '@/lib/offlineIndex'
import { formatBytes } from '@/lib/audioCache'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { emitirUso } from '@/lib/usage'

function percent(p: PrefetchProgress | null): number {
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
}

// Texto del progreso: cada fase cuenta cosas distintas, así que se cuenta cada
// una a su manera en vez de con un único porcentaje.
function progressLabel(p: PrefetchProgress): string {
  switch (p.phase) {
    case 'data': return `Guardando… ${percent(p)}%`
    case 'files': return `Documentos ${p.done}/${p.total}`
    case 'photos': return `Fotos ${p.done}/${p.total}`
    case 'audio': return `Audios ${p.done}/${p.total}`
  }
}

// Botón "Guardar viaje sin conexión": descarga de una vez los datos del viaje
// para poder consultarlo sin señal (aeropuerto, frontera…). Las fotos y los
// audios se eligen aparte, porque son los que ocupan. Y una vez descargado, se
// puede borrar la copia desde el mismo sitio.
export function OfflineSaveButton({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const [index, setIndex] = useState(() => readOfflineIndex(tripId))
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [ask, setAsk] = useState<DownloadSummary | null>(null)
  const [withPhotos, setWithPhotos] = useState(true)
  const [withAudio, setWithAudio] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Descarga en curso. Va en una ref (y no en el estado) porque hay que
  // consultarlo en el mismo tick en el que Radix cierra el diálogo.
  const runningRef = useRef(false)

  const saved = index !== null

  // Antes de descargar, mira qué extras tiene el viaje y lo que ocupan: si hay
  // fotos o audios se pregunta; si no, no molestamos con un diálogo vacío.
  async function start() {
    if (saving || runningRef.current) return
    setSaving(true)
    setProgress(null)
    const summary = await tripDownloadSummary(tripId).catch(() => null)
    if (!summary || (summary.photos.count === 0 && summary.audio.count === 0)) {
      await save(false, false)
      return
    }
    setWithPhotos(summary.photos.count > 0)
    setWithAudio(index !== null && index.audios.length > 0)
    setAsk(summary)
  }

  async function save(includePhotos: boolean, includeAudio: boolean) {
    runningRef.current = true
    setAsk(null)
    setSaving(true)
    try {
      await prefetchTripOffline(qc, tripId, { includePhotos, includeAudio, onProgress: setProgress })
      const idx = readOfflineIndex(tripId)
      setIndex(idx)
      // Descargar un viaje entero no deja ninguna fila en la base: es el tipo
      // de hecho que solo existe aquí.
      emitirUso('trip.offline_downloaded',
        { fotos: includePhotos, audios: includeAudio, bytes: idx?.bytes ?? 0 }, tripId)
      toast.success('Viaje disponible sin conexión', {
        description: 'Consejo: descarga también el área del destino en Google Maps (Mapas sin conexión) para navegar sin datos.',
        duration: 8000,
      })
    } catch {
      toast.error('No se pudo guardar todo sin conexión')
    } finally {
      runningRef.current = false
      setSaving(false)
      setProgress(null)
    }
  }

  async function remove() {
    setConfirmDelete(false)
    await deleteTripOffline(qc, tripId).catch(() => {})
    setIndex(null)
    emitirUso('trip.offline_deleted', {}, tripId)
    toast.success('Copia sin conexión eliminada')
  }

  const subtitle = saving
    ? 'Descargando el viaje a este dispositivo'
    : saved
      ? [describeOfflineIndex(index), 'toca para actualizar'].filter(Boolean).join(' · ')
      : 'Itinerario, documentos, gastos, guía y fotos'

  return (
    <>
      <div className="w-full flex items-center gap-2 p-4 rounded-xl surface">
        <button
          onClick={start}
          disabled={saving}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
            {saving ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
              : saved ? <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />
                : <WifiOff size={16} style={{ color: 'var(--primary)' }} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {saving
                ? (progress ? progressLabel(progress) : 'Preparando…')
                : saved ? 'Disponible sin conexión' : 'Guardar viaje sin conexión'}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
            {saving && (
              <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: 'var(--secondary)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${percent(progress)}%`, background: 'var(--primary)' }}
                />
              </div>
            )}
          </div>
          {!saved && <Download size={16} className="text-muted-foreground flex-shrink-0" />}
        </button>

        {saved && !saving && (
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Borrar los datos descargados"
            title="Borrar los datos descargados"
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <AlertDialog
        open={!!ask}
        // Elegir una opción también cierra el diálogo y pasa por aquí: solo hay
        // que abortar si se ha cerrado SIN elegir (Escape, toque fuera). Si no,
        // esto apagaba el "saving" recién encendido y la descarga se quedaba
        // corriendo por detrás, sin progreso a la vista.
        onOpenChange={(open) => {
          if (!open && !runningRef.current) { setAsk(null); setSaving(false) }
        }}
      >
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Qué quieres descargar?</AlertDialogTitle>
            <AlertDialogDescription>
              El itinerario, los documentos, los gastos y la guía se descargan siempre:
              ocupan poco. Estos dos son los que llenan el móvil.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            {ask && ask.photos.count > 0 && (
              <Option
                icon={<Images size={16} style={{ color: 'var(--primary)' }} />}
                title={`Fotos (${ask.photos.count})`}
                detail={`${ask.photos.exact ? '' : 'unos '}${formatBytes(ask.photos.bytes)} de descarga · se guardan reducidas, ocupan bastante menos`}
                checked={withPhotos}
                onCheckedChange={setWithPhotos}
              />
            )}
            {ask && ask.audio.count > 0 && (
              <Option
                icon={<Headphones size={16} style={{ color: 'var(--primary)' }} />}
                title={`Audioguías (${ask.audio.count})`}
                detail={`${ask.audio.exact ? '' : 'unos '}${formatBytes(ask.audio.bytes)} en el móvil`}
                checked={withAudio}
                onCheckedChange={setWithAudio}
              />
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSaving(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save(withPhotos, withAudio)}>
              Descargar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Borrar los datos descargados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se libera el sitio que ocupa este viaje en el móvil
              {index && index.bytes > 0 ? ` (${formatBytes(index.bytes)})` : ''}: fotos, audios,
              documentos y los datos guardados. No se borra nada del viaje, que sigue en tu cuenta
              y vuelve a estar aquí en cuanto tengas conexión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => void remove()}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Option({ icon, title, detail, checked, onCheckedChange }: {
  icon: ReactNode
  title: string
  detail: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: 'var(--secondary)' }}>
      <span className="flex-shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
