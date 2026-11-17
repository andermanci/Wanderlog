import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, ClipboardCopy, ClipboardPaste, ExternalLink, FileDown, FileUp } from 'lucide-react'
import { Button, Chip, Notice, Textarea } from '@/design'
import { cn } from '@/lib/utils'
import { AUDIOGUIDE_AI_PROVIDERS, type AudioguideAiProvider } from '@/lib/audioguide/aiProviders'
import { isStandalonePwa } from '@/hooks/usePwaInstall'

export type AiProvider = AudioguideAiProvider
export const AI_PROVIDERS = AUDIOGUIDE_AI_PROVIDERS

type Lazy = string | (() => string)
const resolve = (v: Lazy) => (typeof v === 'function' ? v() : v)

export interface AiExchangeProps<R> {
  /** El encargo para pegar en el chat de la IA. */
  prompt: Lazy
  /** Variante del encargo para adjuntar como archivo, si es distinta. */
  filePrompt?: Lazy
  /** Nombre del archivo descargable (con extensión). */
  fileName?: string
  /** El encargo es largo: se propone el archivo como vía principal. */
  preferFile?: boolean
  /** Ajustes previos que cambian el encargo (nivel de detalle, ritmo…). */
  options?: ReactNode
  /** IA elegida de entrada (un borrador recuperado, la última usada). */
  initialProvider?: AiProvider
  /** Nota junto a una IA concreta (p. ej. Gemini «consulta Google Maps»). */
  providerNotes?: Partial<Record<AiProvider, string>>
  /** Respuesta ya pegada (borrador recuperado tras reiniciarse la PWA). */
  initialText?: string
  /** Para guardar el borrador: se llama al cambiar el texto o la IA. */
  onDraftChange?: (draft: { text: string; provider: AiProvider }) => void
  /** Texto de ejemplo del cuadro de respuesta. */
  pastePlaceholder?: string
  /** Valida la respuesta. Devuelve lo entendido o LANZA un Error con un mensaje para la persona. */
  parse: (text: string) => R
  /** Enseña lo que se ha entendido antes de guardar. */
  review?: (result: R) => ReactNode
  saveLabel?: string | ((result: R) => string)
  saving?: boolean
  onSave: (result: R, rawText: string, provider: AiProvider) => void
  /** Contenido de apoyo bajo el paso 2 (qué va en el encargo). */
  promptDetails?: ReactNode
}

function Step({ n, title, done, active, children }: { n: number; title: string; done?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3.5">
      <span
        className={cn(
          'grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors duration-200',
          done ? 'bg-primary text-primary-foreground' : active ? 'bg-primary-soft text-accent-foreground ring-2 ring-primary/30' : 'bg-secondary text-muted-foreground',
        )}
      >
        {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : n}
      </span>
      <div className="min-w-0 pb-7">
        <h3 className="title-card leading-8">{title}</h3>
        <div className="mt-2 space-y-3">{children}</div>
      </div>
    </li>
  )
}

/**
 * EL asistente para trabajar con una IA sin APIs: eliges tu IA, te llevas el
 * encargo, y traes aquí su respuesta. Lo usan el transporte público, las
 * audioguías y las propuestas de itinerario: se ve y se usa igual en los tres.
 *
 * No trae panel: va DENTRO de un <Panel> o de una página.
 */
export function AiExchange<R>({
  prompt, filePrompt, fileName = 'wanderlog-encargo.md', preferFile, options,
  initialProvider = 'claude', providerNotes, initialText = '', onDraftChange,
  pastePlaceholder = 'Pega aquí la respuesta entera de la IA…',
  parse, review, saveLabel = 'Guardar', saving, onSave, promptDetails,
}: AiExchangeProps<R>) {
  const [provider, setProvider] = useState<AiProvider>(initialProvider)
  const [taken, setTaken] = useState(!!initialText)
  const [text, setText] = useState(initialText)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const prov = AI_PROVIDERS.find(p => p.id === provider) ?? AI_PROVIDERS[0]
  // En la PWA instalada, abrir otra pestaña saca a la persona de la app sin
  // que lo espere: allí se le dice que cambie ella de app.
  const standalone = isStandalonePwa()

  const result = useMemo((): { ok: R } | { error: string } | null => {
    if (!text.trim()) return null
    try { return { ok: parse(text) } } catch (e) {
      return { error: e instanceof Error && e.message ? e.message : 'No hemos podido leer la respuesta. Comprueba que la has pegado entera.' }
    }
  }, [text, parse])
  const ok = result && 'ok' in result ? result.ok : null

  const changeText = (t: string) => { setText(t); onDraftChange?.({ text: t, provider }) }
  const changeProvider = (p: AiProvider) => { setProvider(p); onDraftChange?.({ text, provider: p }) }
  const openProvider = () => { if (!standalone) window.open(prov.url, '_blank', 'noopener') }

  async function copy() {
    try {
      await navigator.clipboard.writeText(resolve(prompt))
      setTaken(true)
      toast.success(`Copiado. Pégalo en ${prov.label} y envíalo.`)
      openProvider()
    } catch {
      toast.error('No se ha podido copiar. Prueba otra vez o descarga el archivo.')
    }
  }

  function download() {
    const blob = new Blob([resolve(filePrompt ?? prompt)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setTaken(true)
    openProvider()
  }

  const copyBtn = (
    <Button variant={preferFile || taken ? 'outline' : 'primary'} block onClick={copy}>
      <ClipboardCopy /> {taken && !preferFile ? 'Copiar otra vez' : preferFile ? 'Copiar como texto' : `Copiar y abrir ${prov.label}`}
    </Button>
  )
  const fileBtn = (
    <Button variant={preferFile && !taken ? 'primary' : 'outline'} block onClick={download}>
      <FileDown /> {preferFile ? `Descargar archivo y abrir ${prov.label}` : 'Descargar como archivo'}
    </Button>
  )

  return (
    <ol className="[&>li:last-child>div]:pb-0">
      <Step n={1} title="Elige tu IA" done={taken} active={!taken}>
        <div role="radiogroup" aria-label="IA" className="flex flex-wrap gap-2">
          {AI_PROVIDERS.map(p => (
            <Chip key={p.id} selected={provider === p.id} onClick={() => changeProvider(p.id)}>{p.label}</Chip>
          ))}
        </div>
        {providerNotes?.[provider] && <p className="text-sm text-muted-foreground">{providerNotes[provider]}</p>}
        {options}
      </Step>

      <Step n={2} title="Llévale el encargo" done={taken} active={!taken}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {preferFile
            ? `Es largo para escribirlo en el chat: descarga el archivo, adjúntalo en ${prov.label} y envíalo.`
            : standalone
              ? `Copia el encargo, cambia a la app de ${prov.label}, pégalo en el cuadro de mensaje y envíalo. Si esta app se reinicia al volver, retomarás donde estabas.`
              : `Copia el encargo, pégalo en el cuadro de mensaje de ${prov.label} y envíalo.`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {preferFile ? <>{fileBtn}{copyBtn}</> : <>{copyBtn}{fileBtn}</>}
        </div>
        {standalone && taken && (
          <Button variant="link" size="sm" asChild>
            <a href={prov.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir {prov.label}</a>
          </Button>
        )}
        {promptDetails}
      </Step>

      <Step n={3} title="Trae aquí su respuesta" done={!!ok} active={taken && !ok}>
        <input
          ref={fileRef} type="file" className="hidden"
          accept=".json,.md,.txt,application/json,text/markdown,text/plain"
          onChange={async e => {
            const f = e.target.files?.[0]
            if (f) { changeText(await f.text()); setUploaded(f.name) }
            e.target.value = ''
          }}
        />
        <div className="relative">
          <Textarea
            rows={4}
            value={text}
            onChange={e => { changeText(e.target.value); setUploaded(null) }}
            placeholder={pastePlaceholder}
            aria-label="Respuesta de la IA"
            className="font-mono text-sm"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline" block
            onClick={async () => {
              try { changeText(await navigator.clipboard.readText()); setUploaded(null) }
              catch { toast.info('Mantén pulsado el cuadro y elige «Pegar».') }
            }}
          >
            <ClipboardPaste /> Pegar
          </Button>
          <Button variant="outline" block onClick={() => fileRef.current?.click()}>
            <FileUp /> <span className="truncate">{uploaded ? `${uploaded} · cambiar` : 'Subir archivo'}</span>
          </Button>
        </div>

        {result && 'error' in result && (
          <Notice tone="danger" title="No hemos podido leer la respuesta">{result.error}</Notice>
        )}

        {ok && (
          <div className="space-y-3 rounded-2xl bg-sunken p-4">
            {review?.(ok)}
            <Button variant="primary" block loading={saving} onClick={() => onSave(ok, text, provider)}>
              {typeof saveLabel === 'function' ? saveLabel(ok) : saveLabel}
            </Button>
          </div>
        )}
      </Step>
    </ol>
  )
}
