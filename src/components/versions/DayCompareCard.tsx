import { useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, ArrowLeft, BedDouble, ChevronDown, Footprints, Lightbulb, MapPin, Maximize2, TrainFront, Plane } from 'lucide-react'
import type { DayDiff, ItemChange } from '@/lib/versions/diff'
import type { DayMetrics } from '@/lib/versions/metrics'
import { hhmm } from '@/lib/versions/snapshot'
import type { SnapshotActivity } from '@/types/database'
import type { SketchPoint } from '@/lib/versions/sketch'
import { RouteSketch } from './RouteSketch'
import { RouteMapDialog } from './RouteMapDialog'
import { CHANGE, SIDE, soft } from './versionStyle'
import type { LegChange, VersionLeg } from '@/lib/versions/transit'
import { LineChips, TransitSteps } from '@/components/itinerary/TransitSteps'
import { SKIP_REASON } from '@/lib/transit/labels'

const isMove = (a: SnapshotActivity) => a.type === 'transport' || a.type === 'flight'
const short = (date: string) => format(parseISO(date), 'd MMM', { locale: es })

// Números de la ruta: las paradas con ubicación, en orden, sin trenes ni vuelos.
// Son los mismos en la lista y en el croquis.
function numbering(items: SnapshotActivity[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of items) if (!isMove(a) && a.lat != null && a.lng != null) m.set(a.id, m.size + 1)
  return m
}

interface Props {
  diff: DayDiff
  mA: DayMetrics
  mB: DayMetrics
  cities: string | null
  hotel: SnapshotActivity | null
  explanation?: string
}

export function DayCompareCard({ diff, mA, mB, cities, hotel, explanation }: Props) {
  const [side, setSide] = useState<'a' | 'b'>('b')
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

  return (
    <article id={`day-${diff.date}`} className="rounded-2xl border bg-card p-4 sm:p-5 scroll-mt-24">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
            {format(date, 'EEEE d MMMM', { locale: es })}
          </p>
          <h3 className="font-serif text-lg font-medium leading-tight">{cities ?? 'Día sin ciudad'}</h3>
          {hotel && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><BedDouble size={12} /> {hotel.title}</p>}
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">
            <span style={{ color: SIDE.a.color }}>{Math.round(mA.km)}</span> → <span style={{ color: SIDE.b.color }} className="font-semibold">{Math.round(mB.km)} km</span>
          </span>
          {Math.abs(kmDelta) >= 1 && (
            <span className="px-2 py-0.5 rounded-full font-medium"
              style={{ background: soft(kmDelta < 0 ? 'var(--success)' : 'var(--warning)'), color: kmDelta < 0 ? 'var(--success)' : 'var(--warning)' }}>
              {kmDelta < 0 ? '−' : '+'}{Math.round(Math.abs(kmDelta))} km
            </span>
          )}
        </div>
      </header>

      {explanation && (
        <p className="text-sm rounded-xl p-3 mb-4 flex gap-2" style={{ background: soft('var(--warning)', 10) }}>
          <Lightbulb size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
          <span><span className="font-medium">Por qué: </span>{explanation}</span>
        </p>
      )}

      {/* Móvil: una columna cada vez */}
      <div className="flex md:hidden p-0.5 rounded-lg mb-3" style={{ background: 'var(--secondary)' }} role="tablist" aria-label="Versión a mostrar">
        {(['a', 'b'] as const).map(s => (
          <button key={s} role="tab" aria-selected={side === s} onClick={() => setSide(s)}
            className="flex-1 text-sm py-1.5 rounded-md font-medium transition-colors"
            style={side === s ? { background: 'var(--card)', color: SIDE[s].color, boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' } : { color: 'var(--muted-foreground)' }}>
            {s === 'a' ? 'A' : 'B'}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
        <Column side="a" hiddenOnMobile={side !== 'a'}>
          {diff.a.length === 0 && <Empty />}
          {diff.a.map(a => {
            const out = diff.movedOut.find(m => m.activity.id === a.id)
            const gone = diff.removed.some(r => r.id === a.id)
            return (
              <WithLegs key={a.id} id={a.id} legs={diff.transit.a} dropped={diff.transit.dropped}>
                <Row activity={a} n={numA.get(a.id)} side="a" faded={!!out || gone}
                  tag={out ? { ...CHANGE.out, label: `Pasa al ${short(out.toDate)}`, icon: ArrowRight } : gone ? CHANGE.removed : undefined} />
              </WithLegs>
            )
          })}
        </Column>
        <Column side="b" hiddenOnMobile={side !== 'b'}>
          {diff.b.length === 0 && <Empty />}
          {diff.b.map(c => (
            <WithLegs key={c.activity.id} id={c.activity.id} legs={diff.transit.b} changes={diff.transit.changes}>
              <Row activity={c.activity} n={numB.get(c.activity.id)} side="b" tag={tagFor(c)} extra={placeTag(c)} />
            </WithLegs>
          ))}
        </Column>
        <div className="md:col-span-2 lg:col-span-1">
          {/* Todo el croquis abre el mapa grande; el botón lo hace evidente. */}
          <button type="button" onClick={() => setMapOpen(true)} disabled={pointsA.length + pointsB.length === 0}
            className="group relative block w-full text-left rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
            aria-label={`Ampliar el mapa del ${short(diff.date)}`}>
            <RouteSketch a={pointsA} b={pointsB} hotel={hotelPoint} label={`Ruta del ${short(diff.date)}: A discontinua, B continua`} />
            {pointsA.length + pointsB.length > 0 && (
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium shadow-sm border border-border transition-colors group-hover:bg-secondary"
                style={{ background: 'var(--card)' }}>
                <Maximize2 size={12} /> Ampliar
              </span>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
            <span className="flex items-center gap-1"><svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke={SIDE.a.color} strokeWidth="2" strokeDasharray="4 3" /></svg>A</span>
            <span className="flex items-center gap-1"><svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke={SIDE.b.color} strokeWidth="3" /></svg>B</span>
            <span>H = hotel</span>
          </p>
        </div>
      </div>
      <RouteMapDialog open={mapOpen} onOpenChange={setMapOpen} a={pointsA} b={pointsB} hotel={hotelPoint}
        title={format(date, 'EEEE d MMMM', { locale: es })} subtitle={cities} />
    </article>
  )
}

function tagFor(c: ItemChange): Tag | undefined {
  if (c.kind === 'moved') return { ...CHANGE.moved, label: `Viene del ${short(c.fromDate!)}`, icon: ArrowLeft }
  if (c.kind === 'time') return { ...CHANGE.time, label: c.fromTime ? `Antes ${c.fromTime}` : 'Nueva hora' }
  if (c.kind === 'added') return CHANGE.added
  return undefined
}

function placeTag(c: ItemChange): Tag | undefined {
  if (c.place == null) return undefined
  if (c.place === 'new') return { ...CHANGE.place, label: 'Ubicación añadida', icon: MapPin }
  const dist = c.place >= 1000 ? `${(c.place / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : `${c.place} m`
  return { ...CHANGE.place, label: `Ubicación corregida · ${dist}`, icon: MapPin }
}

interface Tag { label: string; color: string; icon?: typeof ArrowRight }

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
    <li className="grid grid-cols-[42px_22px_minmax(0,1fr)] gap-2 items-center py-1.5 text-muted-foreground">
      <span />
      <span className="w-[22px] h-[22px] rounded-full grid place-items-center border"><BedDouble size={11} /></span>
      <p className="text-sm leading-snug break-words">{hotel.title}</p>
    </li>
  )
}

// El trayecto entre dos filas: las líneas con su color y los minutos (o que es
// mejor ir andando), y si la ruta es nueva o distinta respecto a la otra
// versión. Se despliega con la ficha completa del itinerario.
function LegRow({ leg, change, dropped }: { leg: VersionLeg; change?: LegChange; dropped?: boolean }) {
  const [open, setOpen] = useState(false)
  const { route, verdict } = leg
  if (!route || !verdict) return null
  const tag: Tag | undefined = change === 'new' ? CHANGE.legNew : change === 'changed' ? CHANGE.legChanged : dropped ? CHANGE.legDropped : undefined
  const hasRides = (route.steps ?? []).some(s => s.kind !== 'walk')
  return (
    <li className="grid grid-cols-[42px_22px_minmax(0,1fr)] gap-2 items-start">
      <span />
      <span className="justify-self-center w-px self-stretch min-h-6" style={{ borderLeft: '1.5px dashed var(--border)' }} aria-hidden />
      <div className="min-w-0 py-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="inline-flex items-center gap-1.5 max-w-full rounded-full border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          style={tag ? { borderColor: soft(tag.color, 45), background: soft(tag.color, 8) } : undefined}>
          {verdict.worth && hasRides ? (
            <><LineChips steps={route.steps} max={3} pill /><span className="shrink-0">{route.total_minutes} min</span></>
          ) : verdict.alternative === 'walk' ? (
            <><Footprints size={11} className="shrink-0" /><span className="truncate">{verdict.walkMinutes} min andando</span></>
          ) : (
            <span className="truncate">{SKIP_REASON[verdict.reason ?? 'otro']}</span>
          )}
          <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {/* La etiqueta va fuera de la píldora: dentro recortaba los nombres de las líneas. */}
        {tag && <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: tag.color }}>{tag.label}</span>}
        </div>
        {open && (
          <TransitSteps route={{ ...route, id: leg.key, trip_id: '' }} from={leg.origin} to={leg.destination}
            fromName={leg.from.title} toName={leg.to.title} />
        )}
      </div>
    </li>
  )
}

function Column({ side, hiddenOnMobile, children }: { side: 'a' | 'b'; hiddenOnMobile: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${hiddenOnMobile ? 'hidden md:block' : ''}`}>
      <p className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: SIDE[side].color }}>
        <span className="w-2 h-2 rounded-full" style={{ background: SIDE[side].color }} /> Versión {side.toUpperCase()}
      </p>
      <ol className="flex flex-col gap-1">{children}</ol>
    </div>
  )
}

function Row({ activity: a, n, side, tag, extra, faded }: { activity: SnapshotActivity; n?: number; side: 'a' | 'b'; tag?: Tag; extra?: Tag; faded?: boolean }) {
  const tags = [tag, extra].filter((t): t is Tag => !!t)
  const tint = tag ?? extra
  const move = isMove(a)
  const Icon = a.type === 'flight' ? Plane : TrainFront
  return (
    <li className="grid grid-cols-[42px_22px_minmax(0,1fr)] gap-2 items-start py-1.5 rounded-lg"
      style={{ opacity: faded ? 0.55 : 1, background: tint && !faded ? soft(tint.color, 7) : undefined }}>
      <span className="text-xs text-muted-foreground tabular-nums text-right pt-0.5">{hhmm(a.start_time) ?? '—'}</span>
      {move ? (
        <span className="w-[22px] h-[22px] rounded-full grid place-items-center border text-muted-foreground"><Icon size={11} /></span>
      ) : n ? (
        <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-[10.5px] font-semibold tabular-nums"
          style={side === 'b'
            ? { background: a.type === 'restaurant' ? 'var(--chart-5)' : SIDE.b.color, color: 'var(--primary-foreground)' }
            : { border: `2px solid ${SIDE.a.color}`, color: SIDE.a.color }}>{n}</span>
      ) : (
        <span className="w-[22px] h-[22px] rounded-full border border-dashed" aria-hidden />
      )}
      <div className="min-w-0">
        <p className={`text-sm leading-snug break-words ${move ? 'text-muted-foreground' : 'font-medium'} ${faded ? 'line-through decoration-1' : ''}`}>{a.title}</p>
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-0.5">
            {tags.map(t => (
              <span key={t.label} className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-px rounded-full"
                style={{ background: soft(t.color, 16), color: t.color }}>
                {t.icon && <t.icon size={10} />}{t.label}
              </span>
            ))}
          </span>
        )}
      </div>
    </li>
  )
}

function Empty() {
  return <li className="text-sm text-muted-foreground py-2">Nada este día.</li>
}

/** Fila compacta para los días que no cambian (se pueden desplegar). */
export function UnchangedDay({ date, count, children }: { date: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-dashed">
      <button className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span><span className="text-foreground font-medium capitalize">{format(parseISO(date), 'EEE d MMM', { locale: es })}</span> · sin cambios · {count} {count === 1 ? 'actividad' : 'actividades'}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  )
}
