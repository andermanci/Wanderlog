import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Bookmark, GitCompareArrows, History, Pencil, Sparkles, Trash2, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import {
  Badge, Button, Card, Confirm, Empty, Field, Input, Menu, Panel, Row, RowList, Segmented, Skeleton, Textarea, type Tone,
} from '@/design'
import {
  useDeleteVersion, useImportVersion, useItineraryVersions, useRenameVersion, useRestoreVersion, useSaveVersion,
} from '@/lib/queries/versions'
import {
  buildExportFile, ImportError, parseClaudeResponse, type ExportPrefs, type ImportResult,
} from '@/lib/versions/claudeExchange'
import { diffItineraries, totalsOf } from '@/lib/versions/diff'
import { versionMetrics } from '@/lib/versions/metrics'
import type { ItineraryDay, ItineraryVersion, SnapshotActivity, Trip, VersionTransit } from '@/types/database'
import { AiExchange } from '@/features/ai-exchange/AiExchange'
import { changesSentence, hasChanges } from './changesSentence'
import { SOURCE_LABEL } from './versionStyle'

export interface VersionsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: Trip
  days: ItineraryDay[]
  live: SnapshotActivity[]
  /** Rutas en transporte público del plan actual, para comparar. */
  liveTransit: VersionTransit[]
  canEdit: boolean
}

const SOURCE_LOOK: Record<ItineraryVersion['source'], { icon: LucideIcon; tone: Tone }> = {
  manual: { icon: Bookmark, tone: 'primary' },
  auto: { icon: History, tone: 'neutral' },
  claude: { icon: Sparkles, tone: 'warning' },
}

// Panel de versiones del plan: guardar cómo está ahora, ver las versiones
// guardadas, compararlas con el plan actual, volver a una y pedir una propuesta
// a una IA. La comparación detallada vive en su propia página
// (VersionComparePage); aquí solo se resume. Un solo panel: pedir la propuesta
// cambia el contenido, no abre otro encima.
export function VersionsPanel({ open, onOpenChange, trip, days, live, liveTransit, canEdit }: VersionsPanelProps) {
  const navigate = useNavigate()
  const { data: versions, isLoading } = useItineraryVersions(trip.id)
  const save = useSaveVersion(trip.id)
  const restore = useRestoreVersion(trip.id)
  const del = useDeleteVersion(trip.id)
  const [view, setView] = useState<'list' | 'ai'>('list')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<ItineraryVersion | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ItineraryVersion | null>(null)

  const dates = useMemo(() => days.map(d => d.date), [days])
  const liveKm = useMemo(() => versionMetrics(live, dates).km, [live, dates])
  const liveCount = live.filter(a => a.type !== 'hotel').length
  const suggested = `Versión del ${format(new Date(), 'd MMM, HH:mm', { locale: es })}`

  const close = (o: boolean) => {
    if (!o) { setView('list'); setNaming(false); setName('') }
    onOpenChange(o)
  }

  const compare = (v: ItineraryVersion) => {
    close(false)
    // Una propuesta se mira como candidata; una versión guardada, como el «antes» del plan actual.
    const q = v.source === 'claude' ? `a=actual&b=${v.id}` : `a=${v.id}&b=actual`
    navigate(`/trips/${trip.id}/itinerary/compare?${q}`)
  }

  const restoreTotals = useMemo(
    () => restoreTarget && totalsOf(diffItineraries(live, restoreTarget.snapshot, dates, liveTransit, restoreTarget.transit)),
    [restoreTarget, live, dates, liveTransit],
  )

  const ai = view === 'ai' && canEdit

  return (
    <>
      <Panel
        open={open}
        onOpenChange={close}
        size={ai ? 'lg' : 'md'}
        title={ai ? 'Pedir una propuesta a una IA' : 'Versiones del plan'}
        description={ai
          ? 'Tú le llevas el plan a tu IA y traes aquí su respuesta. Llega como una versión más: tu plan no cambia hasta que tú lo decidas.'
          : 'Guarda el plan tal como está ahora para poder volver a él, o compara dos formas de organizar el viaje.'}
        onBack={ai ? () => setView('list') : undefined}
      >
        {ai ? (
          <ProposalAssistant trip={trip} days={days} live={live} dates={dates} onSaved={compare} />
        ) : (
          <div className="space-y-6">
            {/* El plan actual y la acción principal */}
            <Card sunken pad="sm" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div>
                  <p className="eyebrow">En uso ahora</p>
                  <p className="title-card">Plan actual</p>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {liveCount} {liveCount === 1 ? 'actividad' : 'actividades'} · {Math.round(liveKm)} km
                </p>
              </div>
              {canEdit && naming && (
                <form
                  className="space-y-3"
                  onSubmit={e => {
                    e.preventDefault()
                    save.mutate(name.trim() || suggested, { onSuccess: () => { setName(''); setNaming(false) } })
                  }}
                >
                  <Field label="Nombre de la versión" hint="Si lo dejas vacío, se guarda con la fecha y la hora.">
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder={suggested} maxLength={80} autoFocus />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary" loading={save.isPending} className="flex-1"><Bookmark /> Guardar</Button>
                    <Button variant="ghost" onClick={() => { setNaming(false); setName('') }}>Cancelar</Button>
                  </div>
                </form>
              )}
              {canEdit && !naming && !!versions?.length && (
                <Button variant="primary" block onClick={() => setNaming(true)}><Bookmark /> Guardar la versión actual</Button>
              )}
            </Card>

            {/* Versiones guardadas */}
            <section className="space-y-3">
              <h3 className="title-card">Versiones guardadas</h3>
              {isLoading ? (
                <div className="space-y-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
              ) : !versions?.length ? (
                <Empty
                  icon={Bookmark}
                  title="Aún no has guardado ninguna versión"
                  description={canEdit
                    ? 'Una versión es una copia del plan en un momento dado. Por ejemplo: guárdala antes de cambiar de día varias visitas. Si luego no te convence, comparas las dos y vuelves a como estaba.'
                    : 'Una versión es una copia del plan en un momento dado, para compararla con el plan actual o volver a ella. Quien puede editar el viaje todavía no ha guardado ninguna.'}
                >
                  {canEdit && !naming && (
                    <Button variant="primary" onClick={() => setNaming(true)}><Bookmark /> Guardar la versión actual</Button>
                  )}
                </Empty>
              ) : (
                <ul className="space-y-3">
                  {versions.map(v => (
                    <li key={v.id}>
                      <VersionCard
                        version={v} live={live} liveTransit={liveTransit} dates={dates} canEdit={canEdit} tripId={trip.id}
                        onCompare={() => compare(v)} onRestore={() => setRestoreTarget(v)} onDelete={() => setDeleteTarget(v)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Propuesta de una IA */}
            {canEdit && (
              <section className="space-y-3">
                <h3 className="title-card">¿Otra forma de organizarlo?</h3>
                <RowList>
                  <Row
                    icon={Sparkles}
                    tone="warning"
                    title="Pedir una propuesta a una IA"
                    subtitle="Claude, ChatGPT, Gemini… Se guarda como una versión para compararla."
                    chevron
                    onClick={() => setView('ai')}
                  />
                </RowList>
              </section>
            )}
          </div>
        )}
      </Panel>

      <Confirm
        open={!!restoreTarget}
        onOpenChange={o => !o && setRestoreTarget(null)}
        title={`¿Usar «${restoreTarget?.name ?? ''}»?`}
        description={
          <>
            <span className="block">{restoreTotals ? changesSentence(restoreTotals) : ''}</span>
            {restoreTarget?.transit && <span className="mt-2 block">Los trayectos en transporte público pasan a ser los de esta versión.</span>}
            <span className="mt-2 block">Antes se guarda tu plan actual como versión, así que puedes deshacerlo.</span>
            {!!restoreTotals?.removed && (
              <span className="mt-2 block font-medium text-destructive">Las actividades que se quitan pierden sus archivos adjuntos.</span>
            )}
          </>
        }
        confirmLabel="Usar esta versión"
        loading={restore.isPending}
        onConfirm={() => restoreTarget && restore.mutate(restoreTarget, { onSuccess: () => setRestoreTarget(null) })}
      />

      <Confirm
        danger
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title={`¿Eliminar «${deleteTarget?.name ?? ''}»?`}
        description="Se elimina solo la versión guardada. Tu plan actual no cambia."
        confirmLabel="Eliminar"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
      />
    </>
  )
}

function VersionCard({ version: v, live, liveTransit, dates, canEdit, tripId, onCompare, onRestore, onDelete }: {
  version: ItineraryVersion
  live: SnapshotActivity[]
  liveTransit: VersionTransit[]
  dates: string[]
  canEdit: boolean
  tripId: string
  onCompare: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const rename = useRenameVersion(tripId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(v.name)
  const look = SOURCE_LOOK[v.source]

  // Cuánto se aleja del plan actual: lo que ayuda a reconocer cada versión.
  const { totals, kmDelta } = useMemo(() => ({
    totals: totalsOf(diffItineraries(live, v.snapshot, dates, liveTransit, v.transit)),
    kmDelta: versionMetrics(v.snapshot, dates).km - versionMetrics(live, dates).km,
  }), [v.snapshot, v.transit, live, liveTransit, dates])
  const changed = hasChanges(totals)

  return (
    <Card pad="sm" className="space-y-3">
      <div className="flex items-start gap-3">
        <span data-tone={look.tone} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
          <look.icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={e => {
                e.preventDefault()
                if (draft.trim() && draft.trim() !== v.name) rename.mutate({ id: v.id, name: draft.trim() })
                setEditing(false)
              }}
            >
              <Field label="Nuevo nombre">
                <Input value={draft} onChange={e => setDraft(e.target.value)} maxLength={80} autoFocus />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>Guardar nombre</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDraft(v.name); setEditing(false) }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <p className="title-card break-words">{v.name}</p>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {SOURCE_LABEL[v.source]} · {format(parseISO(v.created_at), 'd MMM yyyy, HH:mm', { locale: es })}
          </p>
        </div>
        {canEdit && !editing && (
          <Menu
            label={`Más opciones de «${v.name}»`}
            items={[
              { label: 'Renombrar', icon: Pencil, onSelect: () => { setDraft(v.name); setEditing(true) } },
              { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: onDelete },
            ]}
          />
        )}
      </div>

      <p className="text-sm leading-relaxed">
        {changed ? <>Respecto al plan actual: {lowerFirst(changesSentence(totals))}</> : 'Es igual que el plan actual.'}
        {changed && Math.abs(kmDelta) >= 1 && (
          <Badge tone={kmDelta < 0 ? 'success' : 'warning'} className="ml-2 align-middle">
            {kmDelta < 0 ? '−' : '+'}{Math.round(Math.abs(kmDelta))} km
          </Badge>
        )}
      </p>

      {changed && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex-1" onClick={onCompare}><GitCompareArrows /> Comparar</Button>
          {canEdit && <Button variant="secondary" className="flex-1" onClick={onRestore}>Usar esta</Button>}
        </div>
      )}
    </Card>
  )
}

const lowerFirst = (s: string) => `${s[0].toLowerCase()}${s.slice(1)}`

const PACES: { value: ExportPrefs['pace']; label: string }[] = [
  { value: 'tranquilo', label: 'Tranquilo' },
  { value: 'normal', label: 'Normal' },
  { value: 'intenso', label: 'Intenso' },
]

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// El asistente común (elige IA → llévale el encargo → trae su respuesta) con
// lo propio de las propuestas de plan: las preferencias de cómo te gustan los
// días, y el resumen de lo que cambia antes de guardarlo como versión. Nunca
// toca el plan: eso se decide después, en el comparador.
function ProposalAssistant({ trip, days, live, dates, onSaved }: {
  trip: Trip
  days: ItineraryDay[]
  live: SnapshotActivity[]
  dates: string[]
  onSaved: (v: ItineraryVersion) => void
}) {
  const [prefs, setPrefs] = useState<ExportPrefs>({ start: '08:30', end: '19:30', pace: 'normal', notes: '' })
  const save = useImportVersion(trip.id)

  // El encargo lo escribió la app pensando en Claude; vale igual para cualquier IA.
  const prompt = () => buildExportFile(trip, days, live, prefs).replace('Hola, Claude. ', 'Hola. ')

  const parse = useCallback((text: string): ImportResult => {
    try {
      const r = parseClaudeResponse(text, live, dates)
      return { ...r, name: r.name.replace(/^Propuesta de Claude ·/, 'Propuesta de una IA ·') }
    } catch (e) {
      throw new Error(e instanceof ImportError
        ? e.message.replace('de Claude', 'de la IA')
        : 'No hemos podido leer la respuesta. Comprueba que la has pegado entera.', { cause: e })
    }
  }, [live, dates])

  return (
    <AiExchange<ImportResult>
      prompt={prompt}
      filePrompt={prompt}
      fileName={`wanderlog-${slug(trip.name) || 'viaje'}-propuesta.md`}
      preferFile
      options={
        <div className="space-y-3 rounded-2xl bg-sunken p-4">
          <p className="text-sm font-medium">Cómo te gustan los días</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Empezar hacia">
              <Input type="time" value={prefs.start} onChange={e => setPrefs(p => ({ ...p, start: e.target.value }))} />
            </Field>
            <Field label="Terminar hacia">
              <Input type="time" value={prefs.end} onChange={e => setPrefs(p => ({ ...p, end: e.target.value }))} />
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Ritmo</p>
            <Segmented<ExportPrefs['pace']>
              label="Ritmo"
              block
              value={prefs.pace}
              onChange={pace => setPrefs(p => ({ ...p, pace }))}
              options={PACES}
            />
          </div>
          <Field label="Algo más" optional>
            <Textarea
              rows={2}
              value={prefs.notes}
              onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
              placeholder="«Sin madrugar el domingo», «dejar libre la tarde del día 24»…"
            />
          </Field>
        </div>
      }
      promptDetails={
        <p className="text-sm leading-relaxed text-muted-foreground">
          El encargo lleva tu plan día a día, estas preferencias y las reglas: lo que tiene hora fija (vuelos, trenes y
          reservas) no se toca.
        </p>
      }
      parse={parse}
      review={r => <ProposalReview result={r} live={live} dates={dates} />}
      saveLabel="Guardar como versión y comparar"
      saving={save.isPending}
      onSave={({ name, summary, explanations, snapshot }) =>
        save.mutate({ name, summary, explanations, snapshot }, { onSuccess: onSaved })}
    />
  )
}

function ProposalReview({ result, live, dates }: { result: ImportResult; live: SnapshotActivity[]; dates: string[] }) {
  const totals = totalsOf(diffItineraries(live, result.snapshot, dates))
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span data-tone="warning" className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="title-card break-words">{result.name}</p>
          {result.summary && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{result.summary}</p>}
        </div>
      </div>
      <p className="text-sm font-medium">{changesSentence(totals)}</p>
      {result.warnings.length > 0 && (
        <ul className="space-y-1.5 text-sm" aria-label="Avisos">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
