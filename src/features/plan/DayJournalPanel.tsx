import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Camera, Trash2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, IconButton, Notice, Panel, Spinner, Textarea } from '@/design'
import { cn } from '@/lib/utils'
import {
  uploadJournalPhoto, useAddJournalPhotos, useDeleteJournalPhoto, useJournalPhotos, useUpdateDayJournal,
} from '@/lib/queries/journal'
import { useAuthStore } from '@/store/authStore'
import type { ItineraryDay } from '@/types/database'

/** Diario de un día: texto (se guarda también sin conexión) y fotos (necesitan conexión). */
export function DayJournalPanel({ tripId, day, onClose }: { tripId: string; day: ItineraryDay | null; onClose: () => void }) {
  const { user } = useAuthStore()
  const { data: photos } = useJournalPhotos(tripId)
  const updateJournal = useUpdateDayJournal(tripId)
  const addPhotos = useAddJournalPhotos(tripId)
  const deletePhoto = useDeleteJournalPhoto(tripId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Al abrir el diario de otro día, se carga su texto.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  if ((day?.id ?? null) !== loadedFor) {
    setLoadedFor(day?.id ?? null)
    setText(day?.journal ?? '')
  }

  const dayPhotos = (photos ?? []).filter(p => p.day_id === day?.id)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const uploading = progress !== null

  // Sube toda la selección. Nada se descarta por tamaño: cada foto se reduce
  // antes de subirla. De tres en tres para no ahogar la conexión del móvil; si
  // alguna falla, las demás siguen.
  async function upload(files: File[]) {
    if (!day || !user || files.length === 0) return
    if (offline) { toast.info('Las fotos necesitan conexión. El texto sí se guarda sin ella.'); return }
    const dayId = day.id
    const userId = user.id
    setProgress({ done: 0, total: files.length })
    const urls: (string | null)[] = new Array(files.length).fill(null)
    let done = 0
    let cursor = 0
    try {
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (cursor < files.length) {
          const i = cursor++
          try { urls[i] = await uploadJournalPhoto(files[i], userId, tripId, dayId) } catch { /* se cuenta abajo */ }
          done++
          setProgress({ done, total: files.length })
        }
      }))
      // En el orden en que se eligieron, no en el que acabaron de subir.
      const subidas = urls.filter((u): u is string => u !== null)
      if (subidas.length > 0) await addPhotos.mutateAsync({ dayId, fileUrls: subidas })
      const fallos = files.length - subidas.length
      if (fallos > 0) {
        toast.error(subidas.length === 0
          ? (files.length === 1 ? 'No se ha podido subir la foto' : 'No se ha podido subir ninguna foto')
          : `${fallos} de ${files.length} fotos no se han podido subir`)
      }
    } catch { /* addPhotos ya avisa */ } finally {
      setProgress(null)
    }
  }

  async function save() {
    if (!day) return
    await updateJournal.mutateAsync({ dayId: day.id, journal: text }).catch(() => {})
    onClose()
  }

  return (
    <Panel
      open={!!day} onOpenChange={o => { if (!o) onClose() }}
      title="Diario del día"
      description={day ? <span className="first-letter:uppercase inline-block">{format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })}</span> : undefined}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={updateJournal.isPending} onClick={save}>Guardar</Button>
      </>}
    >
      <div className="space-y-5">
        {offline && <Notice tone="info" icon={WifiOff}>Sin conexión: el texto se guarda y se subirá cuando vuelvas a tener red.</Notice>}
        <Textarea value={text} rows={7} autoFocus aria-label="Texto del diario" placeholder="¿Qué tal el día? Sitios, momentos, sabores…" onChange={e => setText(e.target.value)} />

        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos</p>
          <div
            className={cn('grid grid-cols-3 gap-2 rounded-xl sm:grid-cols-4', dragging && 'ring-2 ring-primary ring-offset-4 ring-offset-card')}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault()
              setDragging(false)
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
              if (files.length > 0) void upload(files)
            }}
          >
            {dayPhotos.map(p => (
              <div key={p.id} className="relative aspect-square">
                <a href={p.file_url} target="_blank" rel="noreferrer">
                  <img src={p.file_url} alt="Foto del diario" className="size-full rounded-xl border border-border object-cover" />
                </a>
                <IconButton label="Eliminar foto" size="sm" variant="photo" className="absolute right-1 top-1" onClick={() => deletePhoto.mutate(p.id)}>
                  <Trash2 />
                </IconButton>
              </div>
            ))}
            {progress && Array.from({ length: progress.total - progress.done }).map((_, i) => (
              <div key={`pending-${i}`} className="grid aspect-square place-items-center rounded-xl border border-dashed border-border-strong"><Spinner label="Subiendo" /></div>
            ))}
            <button
              type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {uploading ? <Spinner label="Subiendo" /> : <Camera className="size-6" aria-hidden="true" />}
              {progress ? `${progress.done} de ${progress.total}` : 'Añadir fotos'}
            </button>
          </div>
          <input
            ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
            onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
        </div>
      </div>
    </Panel>
  )
}
