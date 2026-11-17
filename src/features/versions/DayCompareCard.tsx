import { useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft, ArrowRight, BedDouble, ChevronDown, Footprints, Lightbulb, MapPin, Maximize2, Plane, TrainFront,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Card, Notice, Segmented, type Tone } from '@/design'
import { cn } from '@/lib/utils'
import type { DayDiff, ItemChange } from '@/lib/versions/diff'
import type { DayMetrics } from '@/lib/versions/metrics'
import { hhmm } from '@/lib/versions/snapshot'
import type { SketchPoint } from '@/lib/versions/sketch'
import type { LegChange, VersionLeg } from '@/lib/versions/transit'
import { SKIP_REASON } from '@/lib/transit/labels'
import type { SnapshotActivity } from '@/types/database'
import { RouteSketch } from './RouteSketch'
import { LegendLine, RouteMapModal, StopDot } from './RouteMapModal'
import { LegDetail, LineChips } from './LegDetail'
import { CHANGE, SIDE_TONE, type Side } from './versionStyle'

const isMove = (a: SnapshotActivity) => a.type === 'transport' || a.type === 'flight'
const short = (date: string) => format(parseISO(date), 'd MMM', { locale: es })

// Números de la ruta: las paradas con ubicación, en orden, sin trenes ni vuelos.
// Son los mismos en la lista y en el croquis.
function numbering(items: SnapshotActivity[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of items) if (!isMove(a) && a.lat != null && a.lng != null) m.set(a.id, m.size + 1)
  return m
}

interface Tag { label: string; tone: Tone; icon?: LucideIcon }

interface Props {
  diff: DayDiff
  mA: DayMetrics
  mB: DayMetrics
  cities: string | null
  hotel: SnapshotActivity | null
  explanation?: string
}

// Un día que cambia: los dos horarios lado a lado (uno cada vez en el móvil),
// con sus trayectos, y el croquis de las dos rutas superpuestas.
export function DayCompareCard({ diff, mA, mB, cities, hotel, explanation }: Props) {
  const [side, setSide] = useState<Side>('b')
  const [mapOpen, setMapOpen] = useState(false)
  const bItems = diff.b.map(c => c.activity)
  const numB = numbering(bItems)
  const numA = numbering(diff.a)
  const pointsB: SketchPoint[] = bItems.filter(a => numB.has(a.id))
    .map(a => ({ lat: a.lat!, lng: a.lng!, n: numB.get(a.id)!, eat: a.type === 'restaurant', title: a.title }))
  const pointsA: SketchPoint[] = diff.a.filter(a => numA.has(a.id))
    .map(a => ({ lat: a.lat!, lng: a.lng!, n: numA.get(a.id)!, title: a.title }))
  const hotelPoint = hotel?.lat != null && hotel.lng != null ? { lat: hotel.lat, lng: hotel.lng, title: hotel.title } : null
  const kmDelta = mB.km - mA.km
  const date = parseISO(diff.date)
  const hasPoints = pointsA.length + pointsB.length > 0

  return (
    <Card asChild pad="md" className="scroll-mt-28">
      <article id={`day-${diff.date}`}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow">{format(date, 'EEEE d MMMM', { locale: es })}</p>
            <h3 className="title-section">{cities ?? 'Día sin ciudad'}</h3>
            {hotel && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <BedDouble className="size-3.5 shrink-0" aria-hidden="true" /> {hotel.title}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">
              <span className="sr-only">Kilómetros: A </span>
              <span data-tone={SIDE_TONE.a} className="text-tone">{Math.round(mA.km)}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only">, B </span>
              <span data-tone={SIDE_TONE.b} className="font-semibold text-tone">{Math.round(mB.km)} km</span>
            </span>
            {Math.abs(kmDelta) >= 1 && (
              <Badge tone={kmDelta < 0 ? 'success' : 'warning'}>{kmDelta < 0 ? '−' : '+'}{Math.round(Math.abs(kmDelta))} km</Badge>
            )}
          </div>
        </header>

        {explanation && (
          <Notice tone="warning" icon={Lightbulb} title="Por qué" className="mb-4">{explanation}</Notice>
        )}

        {/* Móvil: una columna cada vez */}
        <Segmented<Side>
          label="Versión a mostrar"
          value={side}
          onChange={setSide}
          options={[{ value: 'a', label: 'Versión A' }, { value: 'b', label: 'Versión B' }]}
          block
          className="mb-3 md:hidden"
        />

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16.25rem]">
          <Column side="a" hiddenOnMobile={side !== 'a'}>
            {diff.a.length === 0 && <Nothing />}
            {diff.a.map(a => {
              const out = diff.movedOut.find(m => m.activity.id === a.id)
              const gone = diff.removed.some(r => r.id === a.id)
              return (
                <WithLegs key={a.id} id={a.id} legs={diff.transit.a} dropped={diff.transit.dropped}>
                  <ItemRow
                    activity={a} n={numA.get(a.id)} side="a" faded={!!out || gone}
                    tag={out ? { ...CHANGE.out, label: `Pasa al ${short(out.toDate)}`, icon: ArrowRight } : gone ? CHANGE.removed : undefined}
                  />
                </WithLegs>
              )
            })}
          </Column>
          <Column side="b" hiddenOnMobile={side !== 'b'}>
            {diff.b.length === 0 && <Nothing />}
            {diff.b.map(c => (
              <WithLegs key={c.activity.id} id={c.activity.id} legs={diff.transit.b} changes={diff.transit.changes}>
                <ItemRow activity={c.activity} n={numB.get(c.activity.id)} side="b" tag={tagFor(c)} extra={placeTag(c)} />
              </WithLegs>
            ))}
          </Column>

          <div className="md:col-span-2 lg:col-span-1">
            {/* Todo el croquis abre el mapa grande; el rótulo lo hace evidente. */}
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              disabled={!hasPoints}
              className="group relative block w-full rounded-xl text-left disabled:cursor-default"
              aria-label={`Ver el ${short(diff.date)} en el mapa`}
            >
              <RouteSketch a={pointsA} b={pointsB} hotel={hotelPoint} label={`Ruta del ${short(diff.date)}: A discontinua, B continua`} />
              {hasPoints && (
                <span className="absolute bottom-2 right-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-card px-3.5 text-sm font-medium shadow-card transition-colors group-hover:bg-secondary">
                  <Maximize2 className="size-4" aria-hidden="true" /> Ver en el mapa
                </span>
              )}
            </button>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
              <LegendLine side="a" short />
              <LegendLine side="b" short />
              <span>H = hotel</span>
            </p>
          </div>
        </div>

        <RouteMapModal
          open={mapOpen} onOpenChange={setMapOpen} a={pointsA} b={pointsB} hotel={hotelPoint}
          title={format(date, 'EEEE d MMMM', { locale: es })} subtitle={cities}
        />
      </article>
    </Card>
  )
}

function tagFor(c: ItemChange): Tag | undefined {
  if (c.kind === 'moved') return { ...CHANGE.moved, label: `Viene del ${short(c.fromDate!)}`, icon: ArrowLeft }
  if (c.kind === 'time') return { ...CHANGE.time, label: c.fromTime ? `Antes a las ${c.fromTime}` : 'Nueva hora' }
  if (c.kind === 'added') return CHANGE.added
  return undefined
}

function placeTag(c: ItemChange): Tag | undefined {
  if (c.place == null) return undefined
  if (c.place === 'new') return { ...CHANGE.place, label: 'Ubicación añadida', icon: MapPin }
  const dist = c.place >= 1000 ? `${(c.place / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : `${c.place} m`
  return { ...CHANGE.place, label: `Ubicación corregida · ${dist}`, icon: MapPin }
}

const ROW = 'grid grid-cols-[2.75rem_1.5rem_minmax(0,1fr)] gap-2'

// Una fila con sus trayectos: el que llega desde el hotel (si el día empieza
// en él) y el que sale hacia la siguiente parada o hacia el hotel. Solo se
// pintan los que tienen ruta guardada en esa versión.
function WithLegs({ id, legs, changes, dropped, children }: {
  id: string
  legs: VersionLeg[]
  changes?: Map<string, LegChange>
  dropped?: Set<string>
  children: ReactNode
}) {
  const before = legs.find(l => l.to.id === id && l.from.type === 'hotel' && l.route)
  const after = legs.find(l => l.from.id === id && l.route)
  return (
    <>
      {before && <><HotelRow hotel={before.from} /><LegRow leg={before} change={changes?.get(before.key)} dropped={dropped?.has(before.key)} /></>}
      {children}
      {after && <LegRow leg={after} change={changes?.get(after.key)} dropped={dropped?.has(after.key)} />}
      {after?.to.type === 'hotel' && <HotelRow hotel={after.to} />}
    </>
  )
}

function HotelRow({ hotel }: { hotel: SnapshotActivity }) {
  return (
    <li className={cn(ROW, 'items-center py-1.5 text-muted-foreground')}>
      <span />
      <span className="grid size-6 place-items-center rounded-full border border-border-strong">
        <BedDouble className="size-3" aria-hidden="true" />
      </span>
      <p className="break-words text-sm leading-snug">{hotel.title}</p>
    </li>
  )
}

// El trayecto entre dos filas: las líneas con su color y los minutos (o que es
// mejor ir andando), y si la ruta es nueva o distinta respecto a la otra
// versión. Se despliega con la ficha completa.
function LegRow({ leg, change, dropped }: { leg: VersionLeg; change?: LegChange; dropped?: boolean }) {
  const [open, setOpen] = useState(false)
  const { route, verdict } = leg
  if (!route || !verdict) return null
  const tag = change === 'new' ? CHANGE.legNew : change === 'changed' ? CHANGE.legChanged : dropped ? CHANGE.legDropped : undefined
  const hasRides = (route.steps ?? []).some(s => s.kind !== 'walk')
  return (
    <li className={cn(ROW, 'items-start')}>
      <span />
      <span className="min-h-6 w-0 justify-self-center self-stretch border-l-2 border-dashed border-border-strong" aria-hidden="true" />
      <div className="min-w-0 py-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            data-tone={tag?.tone}
            className={cn(
              'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary',
              tag ? 'border-tone-line bg-tone-soft' : 'border-border-strong',
            )}
          >
            {verdict.worth && hasRides ? (
              <><LineChips steps={route.steps} max={3} /><span className="shrink-0 tabular-nums">{route.total_minutes} min</span></>
            ) : verdict.alternative === 'walk' ? (
              <><Footprints className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate tabular-nums">{verdict.walkMinutes} min andando</span></>
            ) : (
              <span className="truncate">{SKIP_REASON[verdict.reason ?? 'otro']}</span>
            )}
            <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            <span className="sr-only">{open ? 'Ocultar el trayecto' : 'Ver el trayecto'}</span>
          </button>
          {/* La etiqueta va fuera de la píldora: dentro recortaba los nombres de las líneas. */}
          {tag && <span data-tone={tag.tone} className="whitespace-nowrap text-xs font-semibold text-tone">{tag.label}</span>}
        </div>
        {open && <LegDetail leg={leg} />}
      </div>
    </li>
  )
}

function Column({ side, hiddenOnMobile, children }: { side: Side; hiddenOnMobile: boolean; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', hiddenOnMobile && 'hidden md:block')}>
      <p data-tone={SIDE_TONE[side]} className="mb-2 hidden items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-tone md:flex">
        <span className={cn('size-2 rounded-full', side === 'a' ? 'border-2 border-tone' : 'bg-tone')} aria-hidden="true" /> Versión {side.toUpperCase()}
      </p>
      <ol className="flex flex-col gap-1">{children}</ol>
    </div>
  )
}

function ItemRow({ activity: a, n, side, tag, extra, faded }: {
  activity: SnapshotActivity; n?: number; side: Side; tag?: Tag; extra?: Tag; faded?: boolean
}) {
  const tags = [tag, extra].filter((t): t is Tag => !!t)
  const tint = tag ?? extra
  const move = isMove(a)
  const Icon = a.type === 'flight' ? Plane : TrainFront
  return (
    <li
      data-tone={tint?.tone}
      className={cn(ROW, 'items-start rounded-lg py-1.5', faded && 'opacity-60', tint && !faded && 'bg-tone-soft')}
    >
      <span className="pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{hhmm(a.start_time) ?? '—'}</span>
      {move ? (
        <span className="grid size-6 place-items-center rounded-full border border-border-strong text-muted-foreground">
          <Icon className="size-3" aria-hidden="true" />
        </span>
      ) : n ? (
        <StopDot side={side} n={n} eat={a.type === 'restaurant'} />
      ) : (
        <span className="size-6 rounded-full border border-dashed border-border-strong" aria-hidden="true" />
      )}
      <div className="min-w-0 pr-2">
        <p className={cn('break-words text-sm leading-snug', move ? 'text-muted-foreground' : 'font-medium', faded && 'line-through decoration-1')}>
          {a.title}
        </p>
        {tags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {tags.map(t => <Badge key={t.label} tone={t.tone} icon={t.icon}>{t.label}</Badge>)}
          </span>
        )}
      </div>
    </li>
  )
}

function Nothing() {
  return <li className="py-2 text-sm text-muted-foreground">Nada este día.</li>
}

/** Fila compacta para los días que no cambian (se pueden desplegar). */
export function UnchangedDay({ date, count, children }: { date: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-dashed border-border-strong">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>
          <span className="inline-block font-medium first-letter:uppercase text-foreground">{format(parseISO(date), 'EEE d MMM', { locale: es })}</span>
          {' · sin cambios · '}{count} {count === 1 ? 'actividad' : 'actividades'}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
