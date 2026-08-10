import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BookOpen, Camera, Loader2, Trash2, WifiOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useJournalPhotos, useUpdateDayJournal, useAddJournalPhotos, useDeleteJournalPhoto, uploadJournalPhoto } from '@/lib/queries/journal'
import { useAuthStore } from '@/store/authStore'
import type { ItineraryDay } from '@/types/database'
import { toast } from 'sonner'

interface DayJournalDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
  day: ItineraryDay | null
}

// Diario de un día: texto (funciona offline) + fotos (requieren conexión).
export function DayJournalDialog({ open, onClose, tripId, day }: DayJournalDialogProps) {
  const { user } = useAuthStore()
  const { data: photos } = useJournalPhotos(tripId)
  const updateJournal = useUpdateDayJournal(tripId)
  const addPhotos = useAddJournalPhotos(tripId)
  const deletePhoto = useDeleteJournalPhoto(tripId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (open) setText(day?.journal ?? '')
  }, [open, day])

  const dayPhotos = (photos ?? []).filter(p => p.day_id === day?.id)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const uploading = progress !== null

  // Sube toda la selección. Nada se descarta por tamaño: cada foto se reduce
  // antes de subirla (uploadJournalPhoto). Varias a la vez, pero de tres en tres
  // para no ahogar la conexión del móvil; si alguna falla, las demás siguen.
  async function handlePhotosUpload(files: File[]) {
    if (!day || !user || files.length === 0) return
    if (offline) { toast.info('Las fotos necesitan conexión; el texto sí se guarda offline'); return }

    const { id: dayId } = day
    const userId = user.id
    setProgress({ done: 0, total: files.length })
    const urls: (string | null)[] = new Array(files.length).fill(null)
    let done = 0
    let cursor = 0
    const CONCURRENCY = 3
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < files.length) {
          const i = cursor++
          try {
            urls[i] = await uploadJournalPhoto(files[i], userId, tripId, dayId)
          } catch { /* se cuenta abajo por los huecos de urls */ }
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
          ? (files.length === 1 ? 'No se pudo subir la foto' : 'No se pudo subir ninguna foto')
          : `${fallos} de ${files.length} fotos no se pudieron subir`)
      }
    } catch {
      /* el insert falló: addPhotos ya avisa en su onError */
    } finally {
      setProgress(null)
    }
  }

  async function handleSave() {
    if (!day) return
    await updateJournal.mutateAsync({ dayId: day.id, journal: text })
    onClose()
  }

  if (!day) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl capitalize">
            <BookOpen size={18} style={{ color: 'var(--primary)' }} />
            Diario · {format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {offline && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-lg p-2"
              style={{ background: 'var(--secondary)' }}>
              <WifiOff size={12} /> Sin conexión: el texto se guardará y se subirá al reconectar.
            </p>
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="¿Qué tal el día? Lugares, momentos, sabores…"
            autoFocus
          />

          {/* Fotos del día */}
          <div
            className={`flex flex-wrap gap-2 rounded-lg transition-shadow ${
              dragging ? 'ring-2 ring-primary ring-offset-4 ring-offset-background' : ''
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
              if (files.length > 0) handlePhotosUpload(files)
            }}
          >
            {dayPhotos.map(p => (
              <div key={p.id} className="relative group">
                <a href={p.file_url} target="_blank" rel="noreferrer">
                  <img src={p.file_url} alt="" className="w-20 h-20 rounded-lg object-cover border border-border" />
                </a>
                <button
                  type="button"
                  onClick={() => deletePhoto.mutate(p.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-destructive hover:bg-destructive hover:text-white shadow transition-colors"
                  aria-label="Eliminar foto" title="Eliminar foto"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {/* Huecos de las que están en camino */}
            {progress && Array.from({ length: progress.total - progress.done }).map((_, i) => (
              <div key={`pending-${i}`}
                className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              <span className="text-[10px]">
                {progress ? `${progress.done}/${progress.total}` : 'Fotos'}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                handlePhotosUpload(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={updateJournal.isPending}
            variant="brand"
          >
            {updateJournal.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
