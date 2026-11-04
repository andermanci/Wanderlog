import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, ArrowLeftRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripHeader } from '@/components/trips/TripHeader'
import { Scoreboard } from '@/components/versions/Scoreboard'
import { DayCompareCard, UnchangedDay } from '@/components/versions/DayCompareCard'
import { changesSentence } from '@/components/versions/changesSentence'
import { SIDE, SOURCE_LABEL, soft } from '@/components/versions/versionStyle'
import { useTrip } from '@/lib/queries/trips'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useItineraryVersions, useRestoreVersion } from '@/lib/queries/versions'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { citiesLabel } from '@/lib/cities'
import { toLiveSnapshot, hotelFor, hhmm } from '@/lib/versions/snapshot'
import { diffItineraries, totalsOf } from '@/lib/versions/diff'
import { versionMetrics } from '@/lib/versions/metrics'
import type { ItineraryVersion, SnapshotActivity } from '@/types/database'

const LIVE = 'actual'

interface Option { id: string; name: string; snap: SnapshotActivity[]; version: ItineraryVersion | null }

// Comparador de dos versiones del itinerario: marcador arriba, tira de días y,
// por cada día que cambia, los dos horarios con su croquis superpuesto. Abajo,
// fija, la acción de quedarse con la versión que convence.
export function VersionComparePage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: trip } = useTrip(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: versions } = useItineraryVersions(tripId!)
  const { data: role } = useTripRole(tripId!)
  const canEdit = canEditRole(role)
  const restore = useRestoreVersion(tripId!)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [confirm, setConfirm] = useState<Option | null>(null)

  const options = useMemo<Option[]>(() => {
    if (!days || !activities) return []
    return [
      { id: LIVE, name: 'Itinerario actual', snap: toLiveSnapshot(activities, days), version: null },
      ...(versions ?? []).map(v => ({ id: v.id, name: v.name, snap: v.snapshot, version: v })),
    ]
  }, [days, activities, versions])

  // Por defecto: una propuesta de Claude se mira como candidata (B) frente al
  // actual; una foto guardada es el "antes" (A) y el actual el "ahora" (B).
  const latest = versions?.[0]
  const fallback = latest?.source === 'claude' ? { a: LIVE, b: latest.id } : { a: latest?.id ?? LIVE, b: LIVE }
  const idA = params.get('a') ?? fallback.a
  const idB = params.get('b') ?? fallback.b
  const A = options.find(o => o.id === idA) ?? options[0]
  const B = options.find(o => o.id === idB) ?? options[1] ?? options[0]
  const dates = useMemo(() => days?.map(d => d.date) ?? [], [days])

  const view = useMemo(() => {
    if (!A || !B) return null
    const diff = diffItineraries(A.snap, B.snap, dates)
    return { diff, totals: totalsOf(diff), mA: versionMetrics(A.snap, dates), mB: versionMetrics(B.snap, dates) }
  }, [A, B, dates])

  const setSide = (side: 'a' | 'b', id: string) => {
    const next = new URLSearchParams(params)
    next.set(side, id)
    setParams(next, { replace: true })
  }
  const swap = () => setParams({ a: B.id, b: A.id }, { replace: true })

  // Lo que se puede "usar": la versión guardada del par (si una de las dos es el actual).
  const candidate = B?.version ? B : A?.version && B?.id === LIVE ? A : null

  if (!trip || !days || !activities || !versions || !view || !A || !B) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const chosen = view.diff.filter(d => !onlyChanged || d.changes > 0)
  const dayById = new Map(days.map(d => [d.date, d]))

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Comparar versiones" />

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <Link to={`/trips/${tripId}/itinerary`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> Itinerario
          </Link>
          <h1 className="font-serif text-2xl font-medium">Comparar versiones</h1>
        </div>
      </div>

      {/* Selector A ↔ B */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3 mb-5">
        <SidePicker side="a" value={A.id} options={options} onChange={id => setSide('a', id)} />
        <Button variant="outline" size="icon" className="rounded-full" onClick={swap} aria-label="Intercambiar A y B" title="Intercambiar A y B">
          <ArrowLeftRight size={16} />
        </Button>
        <SidePicker side="b" value={B.id} options={options} onChange={id => setSide('b', id)} />
      </div>

      {B.version?.source === 'claude' && B.version.summary && (
        <div className="rounded-2xl p-4 mb-5 flex gap-3" style={{ background: soft('var(--warning)', 10) }}>
          <Sparkles size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
          <div>
            <p className="text-sm font-medium">Lo que propone Claude</p>
            <p className="text-sm text-muted-foreground">{B.version.summary}</p>
          </div>
        </div>
      )}

      {A.id === B.id ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Elige dos versiones distintas para compararlas.</p>
      ) : (
        <>
          <Scoreboard a={view.mA} b={view.mB} nameA={A.name} nameB={B.name} />
          <p className="text-sm text-muted-foreground mt-3 mb-6">{changesSentence(view.totals)}</p>

          {/* Tira de días */}
          <div className="sticky z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 mb-4 backdrop-blur"
            style={{ top: 'env(safe-area-inset-top, 0px)', background: 'color-mix(in srgb, var(--background) 88%, transparent)' }}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 py-1" role="list" aria-label="Días">
                {view.diff.map(d => (
                  <a key={d.date} role="listitem" href={`#day-${d.date}`}
                    onClick={e => {
                      e.preventDefault()
                      if (d.changes === 0) setOnlyChanged(false)
                      requestAnimationFrame(() => document.getElementById(`day-${d.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                    }}
                    className="shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl border text-xs transition-colors hover:bg-secondary"
                    style={{ opacity: d.changes ? 1 : 0.5, borderColor: d.changes ? soft('var(--primary)', 35) : undefined }}>
                    <span className="capitalize text-muted-foreground text-[10px]">{format(parseISO(d.date), 'EEE', { locale: es })}</span>
                    <span className="font-medium tabular-nums">{format(parseISO(d.date), 'd MMM', { locale: es })}</span>
                    <span className="h-4 mt-0.5 text-[10px] font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>
                      {d.changes ? `● ${d.changes}` : ''}
                    </span>
                  </a>
                ))}
              </div>
              <label className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Switch id="only-changed" checked={onlyChanged} onCheckedChange={setOnlyChanged} /> Solo días con cambios
              </label>
            </div>
          </div>
          <label className="flex sm:hidden items-center gap-2 text-xs text-muted-foreground mb-4">
            <Switch id="only-changed-m" checked={onlyChanged} onCheckedChange={setOnlyChanged} /> Solo días con cambios
          </label>

          <div className="flex flex-col gap-4">
            {chosen.length === 0 && (
              <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Las dos versiones son iguales.</p>
            )}
            {chosen.map(d => {
              const day = dayById.get(d.date)
              const prev = view.diff[view.diff.indexOf(d) - 1]?.date
              const hotel = hotelFor(B.snap, d.date) ?? (prev ? hotelFor(B.snap, prev) : null)
              if (d.changes === 0) {
                return (
                  <div id={`day-${d.date}`} key={d.date} className="scroll-mt-24">
                    <UnchangedDay date={d.date} count={d.b.length}>
                      <ul className="text-sm px-2 flex flex-col gap-1">
                        {d.b.map(c => <li key={c.activity.id} className="flex gap-3"><span className="w-10 text-right text-muted-foreground tabular-nums">{hhmm(c.activity.start_time) ?? '—'}</span>{c.activity.title}</li>)}
                      </ul>
                    </UnchangedDay>
                  </div>
                )
              }
              return (
                <DayCompareCard key={d.date} diff={d} mA={view.mA.days[view.diff.indexOf(d)]} mB={view.mB.days[view.diff.indexOf(d)]}
                  cities={citiesLabel(day) ?? day?.city ?? null} hotel={hotel}
                  explanation={B.version?.explanations?.[d.date]} />
              )
            })}
          </div>
        </>
      )}

      {/* Barra flotante: quedarse con la versión. Sticky dentro del contenido
          (y no fixed) para no tapar la barra lateral; en móvil queda por encima
          de la navegación inferior. */}
      {canEdit && candidate && A.id !== B.id && (
        <div className="sticky z-30 mt-6 bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] md:bottom-4">
          <div className="rounded-2xl border shadow-lg backdrop-blur px-4 py-3 flex items-center justify-between gap-3"
            style={{ background: 'color-mix(in srgb, var(--card) 94%, transparent)' }}>
            <p className="text-sm min-w-0">
              <span className="text-muted-foreground">¿Te convence más </span>
              <span className="font-medium break-words">«{candidate.name}»</span><span className="text-muted-foreground">?</span>
            </p>
            <Button variant="brand" className="shrink-0" onClick={() => setConfirm(candidate)}>Usar esta versión</Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Usar «{confirm?.name}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>{confirm && changesSentence(totalsOf(diffItineraries(options[0].snap, confirm.snap, dates)))}</p>
                <p>Antes se guarda tu itinerario actual como versión, así que puedes deshacerlo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={restore.isPending}
              onClick={() => confirm?.version && restore.mutate(confirm.version, {
                onSuccess: () => { setConfirm(null); navigate(`/trips/${tripId}/itinerary`) },
              })}>
              Usar esta versión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SidePicker({ side, value, options, onChange }: { side: 'a' | 'b'; value: string; options: Option[]; onChange: (id: string) => void }) {
  const current = options.find(o => o.id === value)
  return (
    <div className="rounded-2xl border p-2.5 sm:p-3 min-w-0" style={{ borderColor: soft(SIDE[side].color, 45), background: SIDE[side].soft }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-1" style={{ color: SIDE[side].color }}>Versión {side.toUpperCase()}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-card h-auto min-h-9 text-left" aria-label={`Versión ${side.toUpperCase()}`}>
          <SelectValue>
            <span className="block truncate font-medium">{current?.name}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>
              <span className="flex flex-col">
                <span>{o.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {o.version ? `${SOURCE_LABEL[o.version.source]} · ${format(parseISO(o.version.created_at), "d MMM, HH:mm", { locale: es })}` : 'En uso ahora'}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
