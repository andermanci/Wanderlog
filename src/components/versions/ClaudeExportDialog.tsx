import { useMemo, useState, type ReactNode } from 'react'
import { Copy, Download, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildExportFile, type ExportPrefs } from '@/lib/versions/claudeExchange'
import type { ItineraryDay, SnapshotActivity, Trip } from '@/types/database'
import { soft } from './versionStyle'

const PACES: { value: ExportPrefs['pace']; label: string }[] = [
  { value: 'tranquilo', label: 'Tranquilo' },
  { value: 'normal', label: 'Normal' },
  { value: 'intenso', label: 'Intenso' },
]

// Paso 1 del intercambio con Claude: elegir preferencias y llevarse el archivo.
export function ClaudeExportDialog({ open, onOpenChange, trip, days, live }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  trip: Trip
  days: ItineraryDay[]
  live: SnapshotActivity[]
}) {
  const [prefs, setPrefs] = useState<ExportPrefs>({ start: '08:30', end: '19:30', pace: 'normal', notes: '' })
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => buildExportFile(trip, days, live, prefs), [trip, days, live, prefs])
  const fileName = `wanderlog-${trip.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-para-claude.md`

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Descarga el archivo en su lugar.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium">Pedir una propuesta a Claude</DialogTitle>
          <DialogDescription>Sin coste extra: se hace en el chat de Claude con tu suscripción.</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-5 mt-1">
          <Step n={1} title="Cómo te gustan los días">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pref-start">Empezar hacia</Label>
                <Input id="pref-start" type="time" value={prefs.start} onChange={e => setPrefs(p => ({ ...p, start: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pref-end">Terminar hacia</Label>
                <Input id="pref-end" type="time" value={prefs.end} onChange={e => setPrefs(p => ({ ...p, end: e.target.value }))} />
              </div>
            </div>
            <div className="flex p-0.5 rounded-lg mt-3" style={{ background: 'var(--secondary)' }} role="radiogroup" aria-label="Ritmo">
              {PACES.map(p => (
                <button key={p.value} type="button" role="radio" aria-checked={prefs.pace === p.value}
                  onClick={() => setPrefs(x => ({ ...x, pace: p.value }))}
                  className="flex-1 text-sm py-1.5 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={prefs.pace === p.value
                    ? { background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' }
                    : { color: 'var(--muted-foreground)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <Textarea id="pref-notes" className="mt-3" rows={2} value={prefs.notes}
              onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
              placeholder="Algo más (opcional): «sin madrugar el domingo», «dejar la tarde del 24 libre»…" />
          </Step>

          <Step n={2} title="Llévate el archivo">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="brand" className="gap-1.5" onClick={download}><Download size={15} /> Descargar</Button>
              <Button variant="outline" className="gap-1.5" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar texto'}
              </Button>
            </div>
          </Step>

          <Step n={3} title="Pásaselo a Claude">
            <p className="text-sm text-muted-foreground">
              Abre <span className="text-foreground font-medium">claude.ai</span>, adjunta el archivo (o pega el texto) y envíalo.
              Cuando responda, vuelve aquí y pulsa <span className="text-foreground font-medium">Importar</span> con su respuesta.
            </p>
          </Step>
        </ol>
      </DialogContent>
    </Dialog>
  )
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold tabular-nums"
        style={{ background: soft('var(--primary)', 14), color: 'var(--primary)' }}>{n}</span>
      <div className="min-w-0">
        <p className="font-medium mb-2 leading-7">{title}</p>
        {children}
      </div>
    </li>
  )
}
