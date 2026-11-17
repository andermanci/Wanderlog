import { Fragment, useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Car, ChevronDown } from 'lucide-react'
import { Badge, Panel } from '@/design'
import { cn } from '@/lib/utils'
import { AiExchange } from '@/features/ai-exchange/AiExchange'
import {
  buildTransitPrompt, parseTransitResponse, TransitImportError, type TransitLegInput, type TransitParseResult, type TransitRow,
} from '@/lib/transit/exchange'
import { useSaveTransitRoutes } from '@/lib/queries/transitRoutes'
import { LineChips } from './TransitSteps'

// A partir de aquí el encargo es largo para pegarlo en el chat (y la respuesta
// también): se ofrece como archivo y la respuesta se sube como archivo.
const FILE_THRESHOLD = 12

export interface TransitPanelProps {
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

const plural = (n: number) => `${n} ${n === 1 ? 'trayecto' : 'trayectos'}`

// Transporte público sin APIs: te llevas el encargo con los trayectos en coche
// a la IA que prefieras y traes aquí su respuesta. Se valida al pegar y se
// enseña qué se ha entendido antes de guardar.
export function TransitPanel({ open, onOpenChange, tripId, tripLabel, scopeLabel, legs, redo = false }: TransitPanelProps) {
  const save = useSaveTransitRoutes(tripId)
  const chains = useMemo(() => toChains(legs), [legs])

  const parse = useCallback((text: string): TransitParseResult => {
    try { return parseTransitResponse(text, legs) } catch (e) {
      throw e instanceof TransitImportError ? e : new Error('No se pudo leer la respuesta.')
    }
  }, [legs])

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={redo ? 'Rehacer transporte público' : 'Transporte público'}
      description={
        <>
          {legs.length} {legs.length === 1 ? 'trayecto en coche' : 'trayectos en coche'} {scopeLabel}.{' '}
          {redo
            ? legs.length === 1
              ? 'El encargo incluye lo que se propuso antes para que la IA lo revise. La respuesta nueva sustituye a la guardada.'
              : 'Ya tienen ruta guardada: la que traigas ahora la sustituye.'
            : 'Tu IA te dice qué metro, tren o bus coger y aquí se guarda.'}
        </>
      }
    >
      {/* El panel desmonta su contenido al cerrarse: el asistente empieza de cero cada vez. */}
      <AiExchange<TransitParseResult>
        prompt={() => buildTransitPrompt(tripLabel, legs)}
        filePrompt={() => buildTransitPrompt(tripLabel, legs, { asFile: true })}
        fileName="transporte-publico-prompt.md"
        preferFile={legs.length > FILE_THRESHOLD}
        providerNotes={{ gemini: 'Gemini consulta Google Maps para comprobar las rutas.' }}
        pastePlaceholder="Pega aquí la respuesta entera, con el bloque ```json…"
        parse={parse}
        review={result => <Review result={result} chains={chains} />}
        saveLabel={result => `Guardar ${plural(result.rows.length)}`}
        saving={save.isPending}
        onSave={result => save.mutate(result.rows, {
          onSuccess: () => { toast.success('Transporte público guardado'); onOpenChange(false) },
          onError: e => toast.error(e instanceof Error ? e.message : 'No se pudo guardar'),
        })}
        promptDetails={<PromptLegs chains={chains} count={legs.length} />}
      />
    </Panel>
  )
}

// Qué trayectos van en el encargo. En el móvil va plegado para no alargar la hoja.
function PromptLegs({ chains, count }: { chains: Chain[]; count: number }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <button
        type="button" onClick={() => setShow(s => !s)} aria-expanded={show}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
      >
        <ChevronDown className={cn('size-4 transition-transform', show && 'rotate-180')} aria-hidden="true" />
        {show ? 'Ocultar los trayectos del encargo' : `Ver los ${plural(count)} que van en el encargo`}
      </button>
      <section className={cn('space-y-2.5 rounded-2xl bg-sunken p-4 md:block', !show && 'hidden')} aria-label="Trayectos del encargo">
        <h4 className="eyebrow">Trayectos que van en el encargo</h4>
        <ChainList chains={chains} />
      </section>
    </div>
  )
}

// Lo que se ha entendido de la respuesta, antes de guardar.
function Review({ result, chains }: { result: TransitParseResult; chains: Chain[] }) {
  const worth = result.rows.filter(r => r.worth_it).length
  return (
    <>
      <p className="text-[0.9375rem] font-medium">
        {worth > 0
          ? `En transporte público: ${worth} de ${result.rows.length}.`
          : 'En ninguno compensa el transporte público.'}
      </p>
      {result.warnings.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span><span className="sr-only">Aviso: </span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2.5">
        <h4 className="eyebrow">Lo que ha entendido</h4>
        <ChainList chains={chains} rows={result.rows} />
      </div>
    </>
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
// ser el chip de sus líneas (o «no compensa»).
function ChainList({ chains, rows }: { chains: Chain[]; rows?: TransitRow[] }) {
  const byKey = new Map((rows ?? []).map(r => [`${r.from_activity_id}->${r.to_activity_id}`, r]))
  return (
    <ul className="space-y-2.5">
      {chains.map((c, ci) => (
        <li key={ci} className="text-sm leading-8">
          {c.names.map((name, i) => {
            const r = i > 0 ? byKey.get(c.keys[i - 1]) : undefined
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <span className="mx-1.5 inline-flex items-center align-middle">
                    {r?.worth_it ? (
                      <span className="inline-flex items-center gap-1">
                        <LineChips steps={r.steps} max={2} pill />
                        {r.total_minutes != null && <span className="text-xs font-medium tabular-nums">{r.total_minutes} min</span>}
                      </span>
                    ) : r ? (
                      <span title={r.note ?? 'No compensa el transporte público'}>
                        <Badge tone="neutral" icon={Car}>no compensa</Badge>
                      </span>
                    ) : (
                      <>
                        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">a</span>
                      </>
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
