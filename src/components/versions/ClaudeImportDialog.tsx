import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileUp, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ImportError, parseClaudeResponse, type ImportResult } from '@/lib/versions/claudeExchange'
import { diffItineraries, totalsOf } from '@/lib/versions/diff'
import { useImportVersion } from '@/lib/queries/versions'
import type { ItineraryDay, ItineraryVersion, SnapshotActivity, Trip } from '@/types/database'
import { changesSentence } from './changesSentence'
import { soft } from './versionStyle'

// Paso final del intercambio con Claude: pegar (o subir) su respuesta, ver qué
// propone y guardarla como versión. Nunca toca el itinerario: eso se decide
// después, en el comparador.
export function ClaudeImportDialog({ open, onOpenChange, trip, days, live, onImported }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  trip: Trip
  days: ItineraryDay[]
  live: SnapshotActivity[]
  onImported: (v: ItineraryVersion) => void
}) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const save = useImportVersion(trip.id)
  const dates = useMemo(() => days.map(d => d.date), [days])

  const result = useMemo((): { ok: ImportResult } | { error: string } | null => {
    if (!text.trim()) return null
    try {
      return { ok: parseClaudeResponse(text, live, dates) }
    } catch (e) {
      return { error: e instanceof ImportError ? e.message : 'No se pudo leer la respuesta.' }
    }
  }, [text, live, dates])

  const totals = result && 'ok' in result ? totalsOf(diffItineraries(live, result.ok.snapshot, dates)) : null

  const reset = (o: boolean) => {
    if (!o) setText('')
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium">Importar la propuesta de Claude</DialogTitle>
          <DialogDescription>Pega su respuesta entera o sube el archivo que te dio. Tu itinerario no cambia hasta que tú lo decidas.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Textarea id="claude-response" rows={6} value={text} onChange={e => setText(e.target.value)}
            placeholder="Pega aquí la respuesta de Claude…" className="font-mono text-xs" aria-label="Respuesta de Claude" />
          <input ref={fileRef} type="file" accept=".json,.md,.txt,application/json,text/markdown,text/plain" className="hidden"
            onChange={async e => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
          <Button variant="outline" className="gap-1.5 self-start" onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Subir archivo
          </Button>
        </div>

        {result && 'error' in result && (
          <p className="text-sm rounded-xl p-3" role="alert" style={{ background: soft('var(--destructive)', 10), color: 'var(--destructive)' }}>
            {result.error}
          </p>
        )}

        {result && 'ok' in result && (
          <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ borderColor: soft('var(--warning)', 40) }}>
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: soft('var(--warning)', 14), color: 'var(--warning)' }}>
                <Sparkles size={17} />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{result.ok.name}</p>
                {result.ok.summary && <p className="text-sm text-muted-foreground">{result.ok.summary}</p>}
              </div>
            </div>
            {totals && <p className="text-sm">{changesSentence(totals)}</p>}
            {result.ok.warnings.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {result.ok.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />{w}</li>
                ))}
              </ul>
            )}
            <Button variant="brand" disabled={save.isPending} onClick={() => {
              const { name, summary, explanations, snapshot } = result.ok
              save.mutate({ name, summary, explanations, snapshot }, { onSuccess: v => { setText(''); onImported(v) } })
            }}>
              Guardar como versión y comparar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
