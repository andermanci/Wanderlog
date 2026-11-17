import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, Headphones, Images, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Confirm, Panel, Progress, SwitchRow } from '@/design'
import {
  prefetchTripOffline, tripDownloadSummary, type DownloadSummary, type PrefetchProgress,
} from '@/lib/offlineTrip'
import { deleteTripOffline, describeOfflineIndex, readOfflineIndex } from '@/lib/offlineIndex'
import { formatBytes } from '@/lib/audioCache'
import { emitirUso } from '@/lib/usage'

function percent(p: PrefetchProgress | null): number {
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
}

// Cada fase cuenta cosas distintas, así que se cuenta cada una a su manera.
function progressLabel(p: PrefetchProgress): string {
  switch (p.phase) {
    case 'data': return `Guardando el viaje… ${percent(p)} %`
    case 'files': return `Documentos: ${p.done} de ${p.total}`
    case 'photos': return `Fotos: ${p.done} de ${p.total}`
    case 'audio': return `Audios: ${p.done} de ${p.total}`
  }
}

/**
 * «Llévate el viaje sin conexión»: descarga, actualiza y borra la copia del
 * viaje en este dispositivo. El ÚNICO sitio donde se gestiona (Inicio del viaje
 * y Ajustes del viaje pintan esta misma tarjeta).
 */
export function OfflineCard({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const [index, setIndex] = useState(() => readOfflineIndex(tripId))
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [ask, setAsk] = useState<DownloadSummary | null>(null)
  const [withPhotos, setWithPhotos] = useState(true)
  const [withAudio, setWithAudio] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Descarga en curso. En una ref porque hay que consultarlo en el mismo tick
  // en el que el panel se cierra.
  const runningRef = useRef(false)

  const saved = index !== null

  // Antes de descargar se mira qué extras tiene el viaje y lo que ocupan: si
  // hay fotos o audios se pregunta; si no, no se molesta con un panel vacío.
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
    setWithAudio(index !== null && index.audios > 0)
    setAsk(summary)
  }

  async function save(includePhotos: boolean, includeAudio: boolean) {
    runningRef.current = true
    setAsk(null)
    setSaving(true)
    try {
      const missing = await prefetchTripOffline(qc, tripId, { includePhotos, includeAudio, onProgress: setProgress })
      const idx = readOfflineIndex(tripId)
      setIndex(idx)
      // Descargar un viaje no deja ninguna fila en la base: solo existe aquí.
      emitirUso('trip.offline_downloaded', { fotos: includePhotos, audios: includeAudio, bytes: idx?.bytes ?? 0 }, tripId)
      // Si algo no ha bajado se dice, con nombre: un «disponible sin conexión»
      // con media descarga fallida no se descubre hasta estar sin cobertura.
      const faltan = [
        ...missing.data,
        missing.docs > 0 ? `${missing.docs} documento${missing.docs > 1 ? 's' : ''}` : '',
        missing.photos > 0 ? `${missing.photos} foto${missing.photos > 1 ? 's' : ''}` : '',
        missing.audios > 0 ? `${missing.audios} audio${missing.audios > 1 ? 's' : ''}` : '',
      ].filter(Boolean)
      if (faltan.length > 0) {
        toast.warning('Viaje guardado, pero falta algo', {
          description: `No se ha podido descargar: ${faltan.join(', ')}. Pulsa «Actualizar» cuando tengas buena conexión.`,
          duration: 12000,
        })
      } else {
        toast.success('Viaje disponible sin conexión', {
          description: 'Consejo: descarga también la zona del destino en Google Maps para orientarte sin datos.',
          duration: 8000,
        })
      }
    } catch {
      toast.error('No se ha podido guardar todo. Inténtalo con mejor conexión.')
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
    toast.success('Copia sin conexión borrada')
  }

  const detail = index ? describeOfflineIndex(index) : ''

  return (
    <>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span data-tone={saved ? 'success' : 'primary'} className="grid size-12 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
          {saved ? <CheckCircle2 className="size-6" aria-hidden="true" /> : <WifiOff className="size-6" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="title-card">
            {saving ? (progress ? progressLabel(progress) : 'Preparando la descarga…') : saved ? 'Guardado en este dispositivo' : 'Llévate el viaje sin conexión'}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {saving
              ? 'No cierres la app hasta que termine.'
              : saved
                ? `Puedes verlo sin internet${detail ? ` (${detail})` : ''}.`
                : 'Descarga el plan, los billetes, los gastos y la guía para consultarlos en el avión o sin cobertura.'}
          </p>
          {saving && <Progress value={percent(progress)} label="Progreso de la descarga" className="mt-3" />}
        </div>
        {!saving && (
          <div className="flex shrink-0 gap-2">
            {saved ? (
              <>
                <Button variant="outline" onClick={start}><RefreshCw /> Actualizar</Button>
                <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Borrar</Button>
              </>
            ) : (
              <Button variant="soft" onClick={start}><Download /> Descargar</Button>
            )}
          </div>
        )}
      </Card>

      <Panel
        open={!!ask}
        // Elegir «Descargar» también cierra el panel y pasa por aquí: solo se
        // aborta si se ha cerrado SIN elegir. Si no, esto apagaba el «saving»
        // recién encendido y la descarga seguía por detrás sin progreso a la vista.
        onOpenChange={o => { if (!o && !runningRef.current) { setAsk(null); setSaving(false) } }}
        title="¿Qué quieres descargar?"
        description="El plan, los documentos, los gastos y la guía se descargan siempre: ocupan poco. Lo de abajo es lo que llena el móvil."
        footer={<Button variant="primary" onClick={() => void save(withPhotos, withAudio)}><Download /> Descargar</Button>}
      >
        <div className="space-y-3">
          {ask && ask.photos.count > 0 && (
            <Card sunken pad="sm" className="flex items-center gap-3">
              <Images className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <SwitchRow
                  label={`Fotos (${ask.photos.count})`}
                  description={`${ask.photos.exact ? '' : 'Unos '}${formatBytes(ask.photos.bytes)} de descarga. Se guardan reducidas y ocupan bastante menos.`}
                  checked={withPhotos} onCheckedChange={setWithPhotos}
                />
              </div>
            </Card>
          )}
          {ask && ask.audio.count > 0 && (
            <Card sunken pad="sm" className="flex items-center gap-3">
              <Headphones className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <SwitchRow
                  label={`Audioguías (${ask.audio.count})`}
                  description={`${ask.audio.exact ? '' : 'Unos '}${formatBytes(ask.audio.bytes)} en el móvil.`}
                  checked={withAudio} onCheckedChange={setWithAudio}
                />
              </div>
            </Card>
          )}
        </div>
      </Panel>

      <Confirm
        open={confirmDelete} onOpenChange={setConfirmDelete} danger
        title="¿Borrar lo descargado?"
        description={`Se libera el sitio que ocupa este viaje en el dispositivo${index && index.bytes > 0 ? ` (${formatBytes(index.bytes)})` : ''}: fotos, audios, documentos y datos. El viaje no se borra: sigue en tu cuenta y vuelve en cuanto tengas conexión.`}
        confirmLabel="Borrar la copia"
        onConfirm={() => void remove()}
      />
    </>
  )
}
