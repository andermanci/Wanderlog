import { Fragment, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronDown, ClipboardCopy, ClipboardPaste, TrainFront, ArrowRight, FileDown, FileUp, Car } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AUDIOGUIDE_AI_PROVIDERS, type AudioguideAiProvider } from '@/lib/audioguide/aiProviders'
import { isStandalonePwa } from '@/hooks/usePwaInstall'
import {
  buildTransitPrompt, parseTransitResponse, TransitImportError, type TransitLegInput, type TransitParseResult, type TransitRow,
} from '@/lib/transit/exchange'
import { useSaveTransitRoutes } from '@/lib/queries/transitRoutes'
import { LineChips } from './TransitSteps'

// Sin Gemini a propósito: la idea es no depender de Google para esto.
const PROVIDERS = AUDIOGUIDE_AI_PROVIDERS.filter(p => p.id !== 'gemini')
// A partir de aquí el prompt es largo para pegarlo en el chat (y la respuesta
// también): se ofrece como archivo y la respuesta se sube como archivo.
const FILE_THRESHOLD = 12

interface TransitPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  tripLabel: string
  /** "el jueves 26" o "en todo el viaje": para los textos. */
  scopeLabel: string
  legs: TransitLegInput[]
  /** Todos tienen ya ruta: se rehacen y las nuevas sustituyen a las guardadas. */
  redo?: boolean
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span
        className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold shrink-0 transition-colors"
        style={done
          ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
          : { background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
      >
        {done ? <Check size={14} /> : n}
      </span>
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </section>
  )
}

// Transporte público sin APIs: copiar el prompt con los trayectos en coche,
// pegarlo en la IA que prefieras y traer aquí su respuesta. Se valida al
// pegar y se enseña qué se ha entendido antes de guardar.
export function TransitPromptDialog({ open, onOpenChange, tripId, tripLabel, scopeLabel, legs, redo = false }: TransitPromptDialogProps) {
  const [provider, setProvider] = useState<AudioguideAiProvider>('claude')
  const [copied, setCopied] = useState(false)
  const [showLegs, setShowLegs] = useState(false)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const big = legs.length > FILE_THRESHOLD
  const save = useSaveTransitRoutes(tripId)
  const prov = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0]
  const standalone = isStandalonePwa()

  const prompt = useMemo(() => buildTransitPrompt(tripLabel, legs), [tripLabel, legs])
  const filePrompt = useMemo(() => buildTransitPrompt(tripLabel, legs, { asFile: true }), [tripLabel, legs])
  const chains = useMemo(() => toChains(legs), [legs])

  const result = useMemo((): { ok: TransitParseResult } | { error: string } | null => {
    if (!text.trim()) return null
    try { return { ok: parseTransitResponse(text, legs) } } catch (e) {
      return { error: e instanceof TransitImportError ? e.message : 'No se pudo leer la respuesta.' }
    }
  }, [text, legs])

  const close = (o: boolean) => {
    if (!o) { setText(''); setFileName(null); setCopied(false); setShowLegs(false) }
    onOpenChange(o)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success(`Prompt copiado. Pégalo en ${prov.label} y envíalo.`)
      if (!standalone) window.open(prov.url, '_blank', 'noopener')
    } catch {
      toast.error('No se pudo copiar. Inténtalo otra vez.')
    }
  }

  function download() {
    const blob = new Blob([filePrompt], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transporte-publico-prompt.md'
    a.click()
    URL.revokeObjectURL(url)
    setCopied(true)
    if (!standalone) window.open(prov.url, '_blank', 'noopener')
  }

  const ok = result && 'ok' in result ? result.ok : null
  const worth = ok?.rows.filter(r => r.worth_it).length ?? 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium flex items-center gap-2">
            <TrainFront size={20} style={{ color: 'var(--primary)' }} />
            {redo ? 'Rehacer transporte público' : 'Transporte público'}
          </DialogTitle>
          <DialogDescription>
            {legs.length} {legs.length === 1 ? 'trayecto en coche' : 'trayectos en coche'} {scopeLabel}.{' '}
            {redo
              ? 'Ya tienen ruta guardada: la que traigas ahora la sustituye.'
              : 'Tu IA te dice qué metro, tren o bus coger y aquí se guarda.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5 min-w-0">
            <Step n={1} done={copied} title="Copia el prompt y pégalo en tu IA">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="IA">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={provider === p.id}
                    onClick={() => setProvider(p.id)}
                    className={cn(
                      'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
                      provider === p.id ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                    style={provider === p.id ? { background: 'color-mix(in srgb, var(--primary) 10%, transparent)' } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {big && (
                <p className="text-xs text-muted-foreground">
                  Son muchos trayectos para el chat: descarga el archivo, adjúntalo en {prov.label} y te devolverá otro archivo con las rutas.
                </p>
              )}
              <div className={cn('flex gap-2', big && 'flex-col-reverse')}>
                <Button variant={copied || big ? 'outline' : 'brand'} className="flex-1 gap-2" onClick={copy}>
                  <ClipboardCopy size={15} />
                  {copied && !big ? 'Copiar otra vez' : big ? 'Copiar como texto' : 'Copiar prompt'}
                </Button>
                <Button variant={big && !copied ? 'brand' : 'outline'} className={cn('gap-2', big ? 'flex-1' : 'shrink-0')} onClick={download}
                  title="Descargar el prompt como archivo para adjuntarlo">
                  <FileDown size={15} />
                  {big ? `Descargar archivo y abrir ${prov.label}` : 'Archivo'}
                </Button>
              </div>
              {/* En el móvil no cabe la columna: la lista va plegada. */}
              <button
                type="button"
                onClick={() => setShowLegs(s => !s)}
                className="md:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={showLegs}
              >
                <ChevronDown size={13} className="transition-transform" style={{ transform: showLegs ? 'rotate(180deg)' : undefined }} />
                Ver qué trayectos van en el prompt
              </button>
            </Step>

            <Step n={2} done={!!ok} title={big ? 'Sube el archivo que te devuelva (o pega el texto)' : 'Pega aquí su respuesta'}>
              <input ref={fileRef} type="file" accept=".json,.md,.txt,application/json,text/markdown,text/plain" className="hidden"
                onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setFileName(f.name) } e.target.value = '' }} />
              <Button variant={big && copied && !text ? 'brand' : 'outline'} className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                <FileUp size={15} />
                {fileName ? `${fileName} · cambiar` : 'Subir archivo de respuesta'}
              </Button>
              <div className="relative">
                <Textarea
                  rows={3}
                  value={text}
                  onChange={e => { setText(e.target.value); setFileName(null) }}
                  placeholder="O pega aquí la respuesta entera, con el bloque ```json…"
                  className="font-mono text-xs pr-10"
                  aria-label="Respuesta de la IA"
                />
                {!text && (
                  <button
                    type="button"
                    title="Pegar del portapapeles"
                    aria-label="Pegar del portapapeles"
                    onClick={async () => { try { setText(await navigator.clipboard.readText()) } catch { /* sin permiso: que pegue a mano */ } }}
                    className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                  >
                    <ClipboardPaste size={14} />
                  </button>
                )}
              </div>

              {result && 'error' in result && (
                <p className="text-sm rounded-xl p-3" role="alert"
                  style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}>
                  {result.error}
                </p>
              )}

              {ok && (
                <>
                  <p className="text-sm font-medium">
                    {worth > 0
                      ? `En transporte público: ${worth} de ${ok.rows.length}. Míralos en la lista.`
                      : 'En ninguno compensa el transporte público.'}
                  </p>
                  {ok.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {ok.warnings.map((w, i) => (
                        <li key={i} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" style={{ color: 'var(--warning)' }} />{w}</li>
                      ))}
                    </ul>
                  )}
                  <Button
                    variant="brand"
                    className="w-full"
                    disabled={save.isPending}
                    onClick={() => save.mutate(ok.rows, {
                      onSuccess: () => { toast.success('Transporte público guardado'); close(false) },
                      onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar'),
                    })}
                  >
                    {save.isPending ? 'Guardando…' : `Guardar ${ok.rows.length} ${ok.rows.length === 1 ? 'trayecto' : 'trayectos'}`}
                  </Button>
                </>
              )}
            </Step>
          </div>

          <aside
            className={cn('min-w-0 rounded-2xl p-4 space-y-3 self-start', showLegs || ok ? 'block' : 'hidden md:block')}
            style={{ background: 'var(--secondary)' }}
            aria-label="Trayectos del prompt"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {ok ? 'Lo que ha entendido' : 'Trayectos que van en el prompt'}
            </h3>
            <ChainList chains={chains} rows={ok?.rows} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface Chain { names: string[]; keys: string[] }

// Los trayectos seguidos (A→B, B→C…) se juntan en una sola línea, A → B → C:
// un día entero cabe en una o dos líneas en vez de una por trayecto.
function toChains(legs: TransitLegInput[]): Chain[] {
  const chains: Chain[] = []
  legs.forEach((l, i) => {
    const prev = legs[i - 1]
    const key = `${l.leg.fromId}->${l.leg.toId}`
    if (prev && prev.leg.toId === l.leg.fromId) {
      const c = chains[chains.length - 1]
      c.names.push(l.to.title)
      c.keys.push(key)
    } else {
      chains.push({ names: [l.from.title, l.to.title], keys: [key] })
    }
  })
  return chains
}

// Cada tramo entre dos sitios es una flecha; con la respuesta pegada, pasa a
// ser el chip de sus líneas (o un coche si no compensa).
function ChainList({ chains, rows }: { chains: Chain[]; rows?: TransitRow[] }) {
  const byKey = new Map((rows ?? []).map(r => [`${r.from_activity_id}->${r.to_activity_id}`, r]))
  return (
    <ul className="space-y-2.5">
      {chains.map((c, ci) => (
        <li key={ci} className="text-xs leading-6">
          {c.names.map((name, i) => {
            const r = i > 0 ? byKey.get(c.keys[i - 1]) : undefined
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <span className="inline-flex items-center align-middle mx-1">
                    {r?.worth_it ? (
                      <span className="inline-flex items-center gap-1">
                        <LineChips steps={r.steps} max={2} pill />
                        {r.total_minutes != null && <span className="text-[10.5px] font-medium">{r.total_minutes}′</span>}
                      </span>
                    ) : r ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 rounded-full text-[10.5px] text-muted-foreground border border-border"
                        title={r.note ?? 'No compensa el transporte público'}>
                        <Car size={10} /> no compensa
                      </span>
                    ) : (
                      <ArrowRight size={12} className="opacity-40" />
                    )}
                  </span>
                )}
                <span className="font-medium">{name}</span>
              </Fragment>
            )
          })}
        </li>
      ))}
    </ul>
  )
}
