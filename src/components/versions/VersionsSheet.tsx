import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Bookmark, GitCompareArrows, History, MoreHorizontal, Pencil, Sparkles, Trash2, Upload, Download, Check, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  useDeleteVersion, useItineraryVersions, useRenameVersion, useRestoreVersion, useSaveVersion,
} from '@/lib/queries/versions'
import { diffItineraries, totalsOf } from '@/lib/versions/diff'
import { versionMetrics } from '@/lib/versions/metrics'
import type { ItineraryDay, ItineraryVersion, SnapshotActivity, Trip } from '@/types/database'
import { SOURCE_LABEL, soft } from './versionStyle'
import { ClaudeExportDialog } from './ClaudeExportDialog'
import { ClaudeImportDialog } from './ClaudeImportDialog'
import { changesSentence } from './changesSentence'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: Trip
  days: ItineraryDay[]
  live: SnapshotActivity[]
  canEdit: boolean
}

const SOURCE_ICON = { manual: Bookmark, auto: History, claude: Sparkles } as const

// Panel de versiones del itinerario: guardar cómo está ahora, ver las fotos
// guardadas, compararlas con el actual y volver a una. La comparación detallada
// vive en su propia página (VersionCompare); aquí solo se resume.
export function VersionsSheet({ open, onOpenChange, trip, days, live, canEdit }: Props) {
  const navigate = useNavigate()
  const { data: versions, isLoading } = useItineraryVersions(trip.id)
  const save = useSaveVersion(trip.id)
  const restore = useRestoreVersion(trip.id)
  const del = useDeleteVersion(trip.id)
  const [name, setName] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<ItineraryVersion | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ItineraryVersion | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const reduce = useReducedMotion()

  const dates = useMemo(() => days.map(d => d.date), [days])
  const liveKm = useMemo(() => versionMetrics(live, dates).km, [live, dates])
  const suggested = `Versión del ${format(new Date(), "d MMM, HH:mm", { locale: es })}`

  const compare = (v: ItineraryVersion) => {
    onOpenChange(false)
    // Una propuesta se mira como candidata; una foto, como el "antes" del actual.
    const q = v.source === 'claude' ? `a=actual&b=${v.id}` : `a=${v.id}&b=actual`
    navigate(`/trips/${trip.id}/itinerary/compare?${q}`)
  }

  const restoreTotals = useMemo(
    () => restoreTarget && totalsOf(diffItineraries(live, restoreTarget.snapshot, dates)),
    [restoreTarget, live, dates],
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 pt-6 pb-4 text-left">
            <SheetTitle className="font-serif text-xl font-medium">Versiones del itinerario</SheetTitle>
            <SheetDescription>
              Guarda cómo está tu plan, prueba otra forma de organizarlo y compáralas. Puedes volver a cualquier versión.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5">
            {/* Itinerario actual */}
            <section className="rounded-2xl border p-4 flex flex-col gap-3"
              style={{ background: soft('var(--primary)', 6), borderColor: soft('var(--primary)', 28) }}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--primary)' }}>En uso</p>
                  <p className="font-medium">Itinerario actual</p>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {live.filter(a => a.type !== 'hotel').length} actividades · {Math.round(liveKm)} km
                </p>
              </div>
              {canEdit && (
                <form className="flex gap-2" onSubmit={e => {
                  e.preventDefault()
                  save.mutate(name.trim() || suggested, { onSuccess: () => setName('') })
                }}>
                  <Input id="version-name" value={name} onChange={e => setName(e.target.value)} placeholder={suggested}
                    aria-label="Nombre de la versión" className="bg-card" maxLength={80} />
                  <Button type="submit" variant="brand" className="gap-1.5 shrink-0" disabled={save.isPending}>
                    <Bookmark size={15} /> Guardar
                  </Button>
                </form>
              )}
            </section>

            {/* Versiones guardadas */}
            <section className="flex flex-col gap-2.5">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Guardadas</h3>
              {isLoading ? (
                <div className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--secondary)' }} />
              ) : !versions?.length ? (
                <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground text-center">
                  Aún no hay versiones. Guarda la actual <strong className="text-foreground font-medium">antes de reorganizar</strong> y
                  podrás comparar o volver atrás cuando quieras.
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  <AnimatePresence initial={false}>
                    {versions.map(v => (
                      <motion.li key={v.id} layout={!reduce}
                        initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <VersionCard version={v} live={live} dates={dates} canEdit={canEdit} tripId={trip.id}
                          onCompare={() => compare(v)} onRestore={() => setRestoreTarget(v)} onDelete={() => setDeleteTarget(v)} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>

            {/* Claude por el chat */}
            {canEdit && (
              <section className="rounded-2xl border p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: soft('var(--chart-4)', 22), color: 'var(--warning)' }}>
                    <Sparkles size={17} />
                  </span>
                  <div>
                    <p className="font-medium">Pedir una propuesta a Claude</p>
                    <p className="text-sm text-muted-foreground">
                      Descarga un archivo, pásaselo a Claude en el chat e importa su respuesta. Llega como una versión más, para compararla.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-1.5" onClick={() => setExportOpen(true)}><Download size={15} /> 1. Exportar</Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}><Upload size={15} /> 2. Importar</Button>
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!restoreTarget} onOpenChange={o => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Usar «{restoreTarget?.name}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>{restoreTotals ? changesSentence(restoreTotals) : ''}</p>
                <p>Antes se guarda tu itinerario actual como versión, así que puedes deshacerlo.</p>
                {!!restoreTotals?.removed && (
                  <p style={{ color: 'var(--destructive)' }}>
                    Las actividades que se quitan pierden sus adjuntos.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={restore.isPending}
              onClick={() => restoreTarget && restore.mutate(restoreTarget, { onSuccess: () => setRestoreTarget(null) })}>
              Usar esta versión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar «{deleteTarget?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Se borra solo la versión guardada. Tu itinerario actual no cambia.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClaudeExportDialog open={exportOpen} onOpenChange={setExportOpen} trip={trip} days={days} live={live} />
      <ClaudeImportDialog open={importOpen} onOpenChange={setImportOpen} trip={trip} days={days} live={live}
        onImported={v => { setImportOpen(false); compare(v) }} />
    </>
  )
}

function VersionCard({ version: v, live, dates, canEdit, tripId, onCompare, onRestore, onDelete }: {
  version: ItineraryVersion
  live: SnapshotActivity[]
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
  const Icon = SOURCE_ICON[v.source]

  // Cuánto se aleja del actual: lo que ayuda a reconocer cada versión.
  const { changes, kmDelta } = useMemo(() => {
    const t = totalsOf(diffItineraries(live, v.snapshot, dates))
    return {
      changes: t.moved + t.time + t.added + t.removed,
      kmDelta: versionMetrics(v.snapshot, dates).km - versionMetrics(live, dates).km,
    }
  }, [v.snapshot, live, dates])

  return (
    <div className="rounded-2xl border bg-card p-3.5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
          style={{ background: soft(v.source === 'claude' ? 'var(--warning)' : 'var(--foreground)', 9),
                   color: v.source === 'claude' ? 'var(--warning)' : 'var(--muted-foreground)' }}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form className="flex gap-1.5" onSubmit={e => {
              e.preventDefault()
              if (draft.trim()) rename.mutate({ id: v.id, name: draft.trim() })
              setEditing(false)
            }}>
              <Input id={`rename-${v.id}`} value={draft} onChange={e => setDraft(e.target.value)} autoFocus className="h-8" maxLength={80} aria-label="Nuevo nombre" />
              <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Guardar nombre"><Check size={15} /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar" onClick={() => { setDraft(v.name); setEditing(false) }}><X size={15} /></Button>
            </form>
          ) : (
            <p className="font-medium leading-snug break-words">{v.name}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {SOURCE_LABEL[v.source]} · {formatDistanceToNow(parseISO(v.created_at), { addSuffix: true, locale: es })}
          </p>
        </div>
        {canEdit && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 -mr-1" aria-label="Más opciones"><MoreHorizontal size={16} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil size={14} /> Renombrar</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} style={{ color: 'var(--destructive)' }}><Trash2 size={14} /> Borrar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs tabular-nums text-muted-foreground">
          {changes === 0 ? 'Igual que el actual' : `${changes} ${changes === 1 ? 'cambio' : 'cambios'} respecto al actual`}
          {changes > 0 && Math.abs(kmDelta) >= 1 && (
            <span style={{ color: kmDelta < 0 ? 'var(--success)' : 'var(--warning)' }}>
              {' · '}{kmDelta < 0 ? '−' : '+'}{Math.round(Math.abs(kmDelta))} km
            </span>
          )}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onCompare} disabled={changes === 0}>
            <GitCompareArrows size={14} /> Comparar
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onRestore} disabled={changes === 0}>Usar</Button>
          )}
        </div>
      </div>
    </div>
  )
}
