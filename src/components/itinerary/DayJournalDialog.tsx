import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BookOpen, Camera, Loader2, Trash2, WifiOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useJournalPhotos, useUpdateDayJournal, useAddJournalPhoto, useDeleteJournalPhoto, uploadJournalPhoto } from '@/lib/queries/journal'
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
  const addPhoto = useAddJournalPhoto(tripId)
  const deletePhoto = useDeleteJournalPhoto(tripId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) setText(day?.journal ?? '')
  }, [open, day])

  const dayPhotos = (photos ?? []).filter(p => p.day_id === day?.id)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  async function handlePhotoUpload(file: File) {
    if (!day || !user) return
    if (offline) { toast.info('Las fotos necesitan conexión; el texto sí se guarda offline'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('La foto supera 10 MB'); return }
    setUploading(true)
    try {
      const url = await uploadJournalPhoto(file, user.id, tripId, day.id)
      await addPhoto.mutateAsync({ dayId: day.id, fileUrl: url })
    } catch {
      toast.error('No se pudo subir la foto')
    } finally {
      setUploading(false)
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              <span className="text-[10px]">{uploading ? 'Subiendo' : 'Foto'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handlePhotoUpload(file)
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
