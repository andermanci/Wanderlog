import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, CheckCircle2, WifiOff } from 'lucide-react'
import { prefetchTripOffline } from '@/lib/offlineTrip'
import { toast } from 'sonner'

// Botón "Guardar viaje sin conexión": descarga de una vez todos los datos e
// imágenes del viaje para poder consultarlo sin señal (aeropuerto, frontera…).
export function OfflineSaveButton({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const flagKey = `wanderlog-offline-${tripId}`
  const [saved, setSaved] = useState(() => localStorage.getItem(flagKey) === '1')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)

  async function save() {
    if (saving) return
    setSaving(true); setProgress(0)
    try {
      await prefetchTripOffline(qc, tripId, (done, total) => setProgress(Math.round((done / total) * 100)))
      localStorage.setItem(flagKey, '1')
      setSaved(true)
      toast.success('Viaje disponible sin conexión', {
        description: 'Consejo: descarga también el área del destino en Google Maps (Mapas sin conexión) para navegar sin datos.',
        duration: 8000,
      })
    } catch {
      toast.error('No se pudo guardar todo sin conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={save}
      disabled={saving}
      className="w-full flex items-center justify-between p-4 rounded-xl transition-colors text-left"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
            : saved ? <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />
              : <WifiOff size={16} style={{ color: 'var(--primary)' }} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {saving ? `Guardando… ${progress}%` : saved ? 'Disponible sin conexión' : 'Guardar viaje sin conexión'}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {saved && !saving ? 'Toca para actualizar la copia offline' : 'Itinerario, documentos, gastos, guía e imágenes'}
          </p>
        </div>
      </div>
      <Download size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  )
}
