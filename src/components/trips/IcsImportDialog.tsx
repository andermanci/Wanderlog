import { useRef, useState } from 'react'
import { Loader2, CalendarPlus, Upload } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DocIcon } from '@/components/icons/DocIcon'
import { useImportIcsBookings } from '@/lib/queries/icsImport'
import { parseIcs, type IcsBooking } from '@/lib/ics/parseIcs'
import { DOCUMENT_LABELS, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

interface IcsImportDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
}

// Importar el .ics que mandan la aerolínea, el hotel o la agencia. Se
// previsualiza lo que se va a crear antes de tocar nada — mismo patrón que la
// importación de movimientos del banco.
export function IcsImportDialog({ open, onClose, tripId }: IcsImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const importBookings = useImportIcsBookings(tripId)
  const [bookings, setBookings] = useState<IcsBooking[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fileName, setFileName] = useState<string | null>(null)

  async function onPick(file: File) {
    const parsed = parseIcs(await file.text())
    setFileName(file.name)
    setBookings(parsed)
    setSelected(new Set(parsed.map(b => b.uid)))
    if (parsed.length === 0) toast.error('No se han encontrado reservas en ese archivo')
  }

  function toggle(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })
  }

  function handleImport() {
    importBookings.mutate(
      bookings.filter(b => selected.has(b.uid)),
      { onSuccess: () => { reset(); onClose() } },
    )
  }

  function reset() {
    setBookings([])
    setSelected(new Set())
    setFileName(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-lg surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus size={18} /> Importar reserva
          </DialogTitle>
          <DialogDescription>
            Sube el archivo .ics que te manda la aerolínea, el hotel o la agencia.
            Se creará el documento con el localizador y, además, la actividad en el
            día que le toque del itinerario.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
        />

        {bookings.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full py-10 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Upload size={22} />
            <span className="text-sm">Elegir archivo .ics</span>
          </button>
        ) : (
          <>
            <p className="text-xs text-muted-foreground -mt-1">
              {fileName} · {bookings.length} {bookings.length === 1 ? 'reserva' : 'reservas'}
            </p>
            <ScrollArea className="max-h-[45vh] pr-2 -mr-2">
              {bookings.map(b => (
                <label
                  key={b.uid}
                  className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-secondary"
                >
                  <Checkbox
                    checked={selected.has(b.uid)}
                    onCheckedChange={() => toggle(b.uid)}
                  />
                  <DocIcon category={b.category} size={16} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_LABELS[b.category] ?? 'Documento'} · {formatDate(b.start.slice(0, 10))}
                      {b.locator && ` · ${b.locator}`}
                    </p>
                  </div>
                </label>
              ))}
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={selected.size === 0 || importBookings.isPending}
            variant="brand"
            className="gap-2"
          >
            {importBookings.isPending && <Loader2 size={14} className="animate-spin" />}
            Importar {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
