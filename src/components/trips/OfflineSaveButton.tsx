import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, CheckCircle2, WifiOff, Headphones } from 'lucide-react'
import { prefetchTripOffline, tripAudioSummary, type PrefetchProgress } from '@/lib/offlineTrip'
import { formatBytes } from '@/lib/audioCache'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface AudioSummary { count: number; bytes: number; exact: boolean }

// Texto del progreso: las tres fases (datos, archivos, audios) cuentan cosas
// distintas, así que cada una se cuenta a su manera en vez de con un único %.
function percent(p: PrefetchProgress | null): number {
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
}

function progressLabel(p: PrefetchProgress): string {
  if (p.phase === 'data') return `Guardando… ${percent(p)}%`
  if (p.phase === 'files') return `Archivos ${p.done}/${p.total}`
  return `Audios ${p.done}/${p.total}`
}

// Botón "Guardar viaje sin conexión": descarga de una vez todos los datos e
// imágenes del viaje para poder consultarlo sin señal (aeropuerto, frontera…).
// Los audios de las audioguías se preguntan aparte, porque pesan.
export function OfflineSaveButton({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const flagKey = `wanderlog-offline-${tripId}`
  const audioFlagKey = `wanderlog-offline-audio-${tripId}`
  const [saved, setSaved] = useState(() => localStorage.getItem(flagKey) === '1')
  const [savedAudio, setSavedAudio] = useState(() => localStorage.getItem(audioFlagKey) === '1')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [askAudio, setAskAudio] = useState<AudioSummary | null>(null)
  // Descarga en curso. Va en una ref (y no en el estado) porque hay que
  // consultarlo en el mismo tick en el que Radix cierra el diálogo.
  const runningRef = useRef(false)

  // Antes de descargar, mira si el viaje tiene audioguías y lo que ocupan: si
  // las hay, se pregunta; si no, no molestamos con un diálogo vacío.
  async function start() {
    if (saving || runningRef.current) return
    setSaving(true)
    setProgress(null)
    const summary = await tripAudioSummary(tripId).catch(() => ({ count: 0, bytes: 0, exact: true }))
    if (summary.count === 0) {
      await save(false)
      return
    }
    setAskAudio(summary)
  }

  async function save(includeAudio: boolean) {
    runningRef.current = true
    setAskAudio(null)
    setSaving(true)
    try {
      await prefetchTripOffline(qc, tripId, { includeAudio, onProgress: setProgress })
      localStorage.setItem(flagKey, '1')
      setSaved(true)
      if (includeAudio) localStorage.setItem(audioFlagKey, '1')
      setSavedAudio(includeAudio || savedAudio)
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

  const subtitle = saving
    ? 'Descargando el viaje a este dispositivo'
    : saved
      ? `Toca para actualizar la copia offline${savedAudio ? ' (incluye audios)' : ''}`
      : 'Itinerario, documentos, gastos, guía e imágenes'

  return (
    <>
      <button
        onClick={start}
        disabled={saving}
        className="w-full flex items-center justify-between p-4 rounded-xl transition-colors text-left surface"
      >
        <div className="flex items-center gap-3 min-w-0">
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
        </div>
        <Download size={16} className="text-muted-foreground flex-shrink-0" />
      </button>

      <AlertDialog
        open={!!askAudio}
        // Elegir una opción también cierra el diálogo y pasa por aquí: solo hay
        // que abortar si se ha cerrado SIN elegir (Escape, toque fuera). Si no,
        // esto apagaba el "saving" recién encendido y la descarga se quedaba
        // corriendo por detrás, sin progreso a la vista.
        onOpenChange={(open) => {
          if (!open && !runningRef.current) { setAskAudio(null); setSaving(false) }
        }}
      >
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif flex items-center gap-2">
              <Headphones size={18} style={{ color: 'var(--primary)' }} />
              ¿Descargar también las audioguías?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {askAudio && (
                <>
                  Este viaje tiene {askAudio.count} audio{askAudio.count > 1 ? 's' : ''} que ocupa
                  {askAudio.count > 1 ? 'n' : ''} {askAudio.exact ? '' : 'unos '}
                  <strong>{formatBytes(askAudio.bytes)}</strong> en el móvil. El resto del viaje
                  (itinerario, documentos, gastos, guía e imágenes) se descarga igualmente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSaving(false)}>Cancelar</AlertDialogCancel>
            <button
              onClick={() => void save(false)}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Sin audios
            </button>
            <AlertDialogAction onClick={() => void save(true)}>
              Descargar con audios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
