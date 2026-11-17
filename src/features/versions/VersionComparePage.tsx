import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeftRight, GitCompareArrows, Sparkles } from 'lucide-react'
import {
  Button, Confirm, Empty, Field, Notice, Page, Select, Skeleton, Stack, Switch,
} from '@/design'
import { cn } from '@/lib/utils'
import { useTrip } from '@/lib/queries/trips'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useItineraryVersions, useRestoreVersion } from '@/lib/queries/versions'
import { useTransitRoutes } from '@/lib/queries/transitRoutes'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { citiesLabel } from '@/lib/cities'
import { toLiveSnapshot, hotelFor, hhmm } from '@/lib/versions/snapshot'
import { diffItineraries, totalsOf } from '@/lib/versions/diff'
import { versionMetrics } from '@/lib/versions/metrics'
import type { ItineraryVersion, SnapshotActivity, VersionTransit } from '@/types/database'
import { Scoreboard } from './Scoreboard'
import { DayCompareCard, UnchangedDay } from './DayCompareCard'
import { changesSentence } from './changesSentence'
import { SIDE_TONE, SOURCE_LABEL, type Side } from './versionStyle'

const LIVE = 'actual'

interface Option { id: string; name: string; snap: SnapshotActivity[]; transit: VersionTransit[] | null; version: ItineraryVersion | null }

// Comparador de dos versiones del plan: marcador arriba, tira de días y, por
// cada día que cambia, los dos horarios con su croquis superpuesto. Abajo,
// fija, la acción de quedarse con la versión que convence.
export function VersionComparePage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: trip } = useTrip(tripId)
  const { data: days } = useItineraryDays(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: versions } = useItineraryVersions(tripId)
  const { data: liveTransit } = useTransitRoutes(tripId)
  const { data: role } = useTripRole(tripId)
  const canEdit = canEditRole(role)
  const restore = useRestoreVersion(tripId)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [confirm, setConfirm] = useState<Option | null>(null)
  const planUrl = `/trips/${tripId}/itinerary`

  const options = useMemo<Option[]>(() => {
    if (!days || !activities) return []
    return [
      { id: LIVE, name: 'Plan actual', snap: toLiveSnapshot(activities, days), transit: liveTransit ?? [], version: null },
      ...(versions ?? []).map(v => ({ id: v.id, name: v.name, snap: v.snapshot, transit: v.transit ?? null, version: v })),
    ]
  }, [days, activities, versions, liveTransit])

  // Por defecto: una propuesta de una IA se mira como candidata (B) frente al
  // plan actual; una versión guardada es el «antes» (A) y el actual el «ahora» (B).
  const latest = versions?.[0]
  const fallback = latest?.source === 'claude' ? { a: LIVE, b: latest.id } : { a: latest?.id ?? LIVE, b: LIVE }
  const idA = params.get('a') ?? fallback.a
  const idB = params.get('b') ?? fallback.b
  const A = options.find(o => o.id === idA) ?? options[0]
  const B = options.find(o => o.id === idB) ?? options[1] ?? options[0]
  const dates = useMemo(() => days?.map(d => d.date) ?? [], [days])

  const view = useMemo(() => {
    if (!A || !B) return null
    const diff = diffItineraries(A.snap, B.snap, dates, A.transit, B.transit)
    return { diff, totals: totalsOf(diff), mA: versionMetrics(A.snap, dates), mB: versionMetrics(B.snap, dates) }
  }, [A, B, dates])

  const page = { width: 'wide', title: 'Comparar versiones', back: { to: planUrl, label: 'Plan' } } as const

  if (!trip || !days || !activities || !versions || !view || !A || !B) {
    return (
      <Page {...page}>
        <Stack>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </Stack>
      </Page>
    )
  }

  if (versions.length === 0) {
    return (
      <Page {...page}>
        <Empty
          icon={GitCompareArrows}
          title="Todavía no hay nada que comparar"
          description="Para comparar hace falta al menos una versión guardada. Guarda el plan tal como está desde «Versiones», en el Plan, y vuelve aquí cuando lo hayas cambiado."
        >
          <Button variant="primary" asChild><Link to={planUrl}>Ir al Plan</Link></Button>
        </Empty>
      </Page>
    )
  }

  const setSide = (side: Side, id: string) => {
    const next = new URLSearchParams(params)
    next.set(side, id)
    setParams(next, { replace: true })
  }
  const swap = () => setParams({ a: B.id, b: A.id }, { replace: true })

  // Lo que se puede «usar»: la versión guardada del par (si una de las dos es el plan actual).
  const candidate = B.version ? B : A.version && B.id === LIVE ? A : null
  const same = A.id === B.id
  const chosen = view.diff.filter(d => !onlyChanged || d.changes > 0)
  const dayByDate = new Map(days.map(d => [d.date, d]))
  const confirmTotals = confirm && totalsOf(diffItineraries(options[0].snap, confirm.snap, dates, options[0].transit, confirm.transit))

  return (
    <Page {...page} subtitle="A es la referencia y B la que estás valorando. Los cambios se cuentan de A a B.">
      {/* Elegir A y B */}
      <div className="mb-6 grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SidePicker side="a" value={A.id} options={options} onChange={id => setSide('a', id)} />
        <Button variant="outline" onClick={swap} className="justify-self-center md:mb-4">
          <ArrowLeftRight /> Intercambiar A y B
        </Button>
        <SidePicker side="b" value={B.id} options={options} onChange={id => setSide('b', id)} />
      </div>

      {B.version?.source === 'claude' && B.version.summary && (
        <Notice tone="warning" icon={Sparkles} title="Lo que propone la IA" className="mb-6">{B.version.summary}</Notice>
      )}

      {same ? (
        <Notice tone="info" title="Has elegido la misma versión en los dos lados">
          Elige dos versiones distintas para compararlas.
        </Notice>
      ) : (
        <>
          <Scoreboard a={view.mA} b={view.mB} nameA={A.name} nameB={B.name} />

          <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="text-[0.9375rem] text-muted-foreground">{changesSentence(view.totals)}</p>
            <label htmlFor="solo-cambios" className="flex min-h-11 items-center gap-3 text-sm">
              <Switch id="solo-cambios" checked={onlyChanged} onCheckedChange={setOnlyChanged} />
              Solo los días con cambios
            </label>
          </div>

          {/* Tira de días: salta a cada uno */}
          <nav aria-label="Días" className="sticky top-0 z-20 -mx-4 mb-4 bg-background/90 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
            <ul className="no-scrollbar flex gap-2 overflow-x-auto py-1">
              {view.diff.map(d => (
                <li key={d.date} className="shrink-0">
                  <a
                    href={`#day-${d.date}`}
                    data-tone="primary"
                    onClick={e => {
                      e.preventDefault()
                      if (d.changes === 0) setOnlyChanged(false)
                      requestAnimationFrame(() => document.getElementById(`day-${d.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                    }}
                    className={cn(
                      'flex min-w-16 flex-col items-center rounded-xl border px-3 py-1.5 transition-colors hover:bg-secondary',
                      d.changes ? 'border-tone-line bg-card' : 'border-border text-muted-foreground',
                    )}
                  >
                    <span className="inline-block text-2xs first-letter:uppercase text-muted-foreground">{format(parseISO(d.date), 'EEE', { locale: es })}</span>
                    <span className="text-sm font-medium tabular-nums">{format(parseISO(d.date), 'd MMM', { locale: es })}</span>
                    <span className={cn('text-2xs font-semibold tabular-nums', d.changes ? 'text-tone' : 'text-muted-foreground')}>
                      {d.changes ? `${d.changes} ${d.changes === 1 ? 'cambio' : 'cambios'}` : 'igual'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-4">
            {chosen.length === 0 && (
              <Notice tone="success" title="Las dos versiones son iguales">No cambia ningún día entre una y otra.</Notice>
            )}
            {chosen.map(d => {
              const i = view.diff.indexOf(d)
              const day = dayByDate.get(d.date)
              const prev = view.diff[i - 1]?.date
              const hotel = hotelFor(B.snap, d.date) ?? (prev ? hotelFor(B.snap, prev) : null)
              if (d.changes === 0) {
                return (
                  <div id={`day-${d.date}`} key={d.date} className="scroll-mt-28">
                    <UnchangedDay date={d.date} count={d.b.length}>
                      {d.b.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nada este día.</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5 text-sm">
                          {d.b.map(c => (
                            <li key={c.activity.id} className="flex gap-3">
                              <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground">{hhmm(c.activity.start_time) ?? '—'}</span>
                              <span className="min-w-0 break-words">{c.activity.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </UnchangedDay>
                  </div>
                )
              }
              return (
                <DayCompareCard
                  key={d.date} diff={d} mA={view.mA.days[i]} mB={view.mB.days[i]}
                  cities={citiesLabel(day) ?? day?.city ?? null} hotel={hotel}
                  explanation={B.version?.explanations?.[d.date]}
                />
              )
            })}
          </div>
        </>
      )}

      {/* Quedarse con la versión. Va pegada abajo dentro del flujo de la página.
          En el móvil sube por encima de la barra de pestañas (que es fija y
          tapa el hueco inferior de <main>) y deja sitio al «+» flotante. */}
      {canEdit && candidate && !same && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 mt-6 mr-[4.5rem] md:bottom-0 md:mr-0 md:pb-4">
          <div className="bar-glass flex flex-col gap-2 rounded-2xl border border-border p-3 shadow-float md:flex-row md:items-center md:justify-between md:gap-4 md:px-5">
            <p className="min-w-0 truncate text-sm md:text-[0.9375rem]">
              <span className="text-muted-foreground">¿Te convence más </span>
              <span className="font-medium">«{candidate.name}»</span>
              <span className="text-muted-foreground">?</span>
            </p>
            <Button variant="primary" className="shrink-0" onClick={() => setConfirm(candidate)}>Usar esta versión</Button>
          </div>
        </div>
      )}

      <Confirm
        open={!!confirm}
        onOpenChange={o => !o && setConfirm(null)}
        title={`¿Usar «${confirm?.name ?? ''}»?`}
        description={
          <>
            <span className="block">{confirmTotals ? changesSentence(confirmTotals) : ''}</span>
            {confirm?.transit && <span className="mt-2 block">Los trayectos en transporte público pasan a ser los de esta versión.</span>}
            <span className="mt-2 block">Antes se guarda tu plan actual como versión, así que puedes deshacerlo.</span>
            {!!confirmTotals?.removed && (
              <span className="mt-2 block font-medium text-destructive">Las actividades que se quitan pierden sus archivos adjuntos.</span>
            )}
          </>
        }
        confirmLabel="Usar esta versión"
        loading={restore.isPending}
        onConfirm={() => confirm?.version && restore.mutate(confirm.version, {
          onSuccess: () => { setConfirm(null); navigate(planUrl) },
        })}
      />
    </Page>
  )
}

function SidePicker({ side, value, options, onChange }: { side: Side; value: string; options: Option[]; onChange: (id: string) => void }) {
  const current = options.find(o => o.id === value)
  const meta = (o: Option) => o.version
    ? `${SOURCE_LABEL[o.version.source]} · ${format(parseISO(o.version.created_at), 'd MMM, HH:mm', { locale: es })}`
    : 'En uso ahora'
  return (
    <div data-tone={SIDE_TONE[side]} className="min-w-0 rounded-2xl border border-tone-line bg-tone-soft p-3.5">
      <Field
        label={
          <span className="flex items-center gap-1.5 text-tone">
            <span className={cn('size-2.5 rounded-full', side === 'a' ? 'border-2 border-tone' : 'bg-tone')} aria-hidden="true" />
            Versión {side.toUpperCase()}
            <span className="font-normal text-muted-foreground">· {side === 'a' ? 'la referencia' : 'la que valoras'}</span>
          </span>
        }
        hint={current ? meta(current) : undefined}
      >
        <Select value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o.id} value={o.id}>{o.name} ({meta(o)})</option>)}
        </Select>
      </Field>
    </div>
  )
}
