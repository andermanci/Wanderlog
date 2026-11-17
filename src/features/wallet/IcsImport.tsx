import { useRef, useState } from 'react'
import { CalendarPlus, FileX2 } from 'lucide-react'
import { Button, Checkbox, DocIcon, Notice } from '@/design'
import { useImportIcsBookings } from '@/lib/queries/icsImport'
import { parseIcs, type IcsBooking } from '@/lib/ics/parseIcs'
import { DOCUMENT_LABELS, formatDate } from '@/lib/utils'
import { PanelFooter } from './PanelSlots'
import { toneOf } from './shared'

interface IcsImportProps {
  tripId: string
  onDone: () => void
  onCancel: () => void
}

// Importar el .ics que mandan la aerolínea, el hotel o la agencia. Primero se
// enseña lo que se va a crear y se elige; no se toca nada hasta pulsar «Importar».
export function IcsImport({ tripId, onDone, onCancel }: IcsImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const importBookings = useImportIcsBookings(tripId)
  const [fileName, setFileName] = useState<string | null>(null)
  const [bookings, setBookings] = useState<IcsBooking[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function onPick(file: File) {
    const parsed = parseIcs(await file.text())
    setFileName(file.name)
    setBookings(parsed)
    setSelected(new Set(parsed.map(b => b.uid)))
  }

  function toggle(uid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })
  }

  const pick = () => fileRef.current?.click()
  const allSelected = bookings.length > 0 && selected.size === bookings.length

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        aria-label="Archivo .ics"
        onChange={e => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = '' }}
      />

      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        Es el archivo de calendario que viene en el correo de confirmación de la aerolínea, el hotel o la agencia.
        Con él guardamos la reserva con su localizador y, si cae dentro del viaje, la ponemos también en el plan.
      </p>

      {bookings.length === 0 ? (
        <>
          {fileName && (
            <Notice tone="warning" icon={FileX2} title="No hemos encontrado reservas en ese archivo">
              Comprueba que es el .ics de la confirmación y prueba otra vez.
            </Notice>
          )}
          <button
            type="button"
            onClick={pick}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-card px-4 py-10 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <CalendarPlus className="size-7" aria-hidden="true" />
            <span className="text-[0.9375rem] font-medium">Elegir archivo .ics</span>
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {fileName} · {bookings.length} {bookings.length === 1 ? 'reserva' : 'reservas'}
            </p>
            <span className="flex gap-1">
              <Button
                variant="ghost" size="sm"
                onClick={() => setSelected(allSelected ? new Set() : new Set(bookings.map(b => b.uid)))}
              >
                {allSelected ? 'Quitar todas' : 'Marcar todas'}
              </Button>
              <Button variant="ghost" size="sm" onClick={pick}>Elegir otro archivo</Button>
            </span>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {bookings.map(b => {
              const id = `ics-${b.uid}`
              return (
                <li key={b.uid} className="flex min-h-15 items-center gap-3.5 px-4 py-3">
                  <Checkbox id={id} checked={selected.has(b.uid)} onCheckedChange={() => toggle(b.uid)} />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <span data-tone={toneOf(b.category)} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                      <DocIcon category={b.category} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-medium">{b.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {DOCUMENT_LABELS[b.category] ?? 'Reserva'} · {formatDate(b.start, b.allDay ? 'EEE d MMM yyyy' : 'EEE d MMM yyyy · HH:mm')}
                        {b.locator && ` · ${b.locator}`}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <PanelFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          loading={importBookings.isPending}
          disabled={selected.size === 0}
          onClick={() => importBookings.mutate(bookings.filter(b => selected.has(b.uid)), { onSuccess: onDone })}
        >
          {selected.size > 0 ? `Importar ${selected.size} ${selected.size === 1 ? 'reserva' : 'reservas'}` : 'Importar'}
        </Button>
      </PanelFooter>
    </div>
  )
}
