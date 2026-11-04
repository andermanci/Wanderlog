import { useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, ArrowLeft, BedDouble, ChevronDown, Lightbulb, TrainFront, Plane } from 'lucide-react'
import type { DayDiff, ItemChange } from '@/lib/versions/diff'
import type { DayMetrics } from '@/lib/versions/metrics'
import { hhmm } from '@/lib/versions/snapshot'
import type { SnapshotActivity } from '@/types/database'
import { RouteSketch, type SketchPoint } from './RouteSketch'
import { CHANGE, SIDE, soft } from './versionStyle'

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
  const bItems = diff.b.map(c => c.activity)
  const numB = numbering(bItems)
  const numA = numbering(diff.a)
  const pointsB: SketchPoint[] = bItems.filter(a => numB.has(a.id)).map(a => ({ lat: a.lat!, lng: a.lng!, n: numB.get(a.id)!, eat: a.type === 'restaurant' }))
  const pointsA: SketchPoint[] = diff.a.filter(a => numA.has(a.id)).map(a => ({ lat: a.lat!, lng: a.lng!, n: numA.get(a.id)! }))
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
              <Row key={a.id} activity={a} n={numA.get(a.id)} side="a" faded={!!out || gone}
                tag={out ? { ...CHANGE.out, label: `Pasa al ${short(out.toDate)}`, icon: ArrowRight } : gone ? CHANGE.removed : undefined} />
            )
          })}
        </Column>
        <Column side="b" hiddenOnMobile={side !== 'b'}>
          {diff.b.length === 0 && <Empty />}
          {diff.b.map(c => <Row key={c.activity.id} activity={c.activity} n={numB.get(c.activity.id)} side="b" tag={tagFor(c)} />)}
        </Column>
        <div className="md:col-span-2 lg:col-span-1">
          <RouteSketch a={pointsA} b={pointsB} hotel={hotel?.lat != null && hotel.lng != null ? { lat: hotel.lat, lng: hotel.lng } : null}
            label={`Ruta del ${short(diff.date)}: A discontinua, B continua`} />
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
            <span className="flex items-center gap-1"><svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke={SIDE.a.color} strokeWidth="2" strokeDasharray="4 3" /></svg>A</span>
            <span className="flex items-center gap-1"><svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke={SIDE.b.color} strokeWidth="3" /></svg>B</span>
            <span>H = hotel</span>
          </p>
        </div>
      </div>
    </article>
  )
}

function tagFor(c: ItemChange): Tag | undefined {
  if (c.kind === 'moved') return { ...CHANGE.moved, label: `Viene del ${short(c.fromDate!)}`, icon: ArrowLeft }
  if (c.kind === 'time') return { ...CHANGE.time, label: c.fromTime ? `Antes ${c.fromTime}` : 'Nueva hora' }
  if (c.kind === 'added') return CHANGE.added
  return undefined
}

interface Tag { label: string; color: string; icon?: typeof ArrowRight }

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

function Row({ activity: a, n, side, tag, faded }: { activity: SnapshotActivity; n?: number; side: 'a' | 'b'; tag?: Tag; faded?: boolean }) {
  const move = isMove(a)
  const Icon = a.type === 'flight' ? Plane : TrainFront
  return (
    <li className="grid grid-cols-[42px_22px_minmax(0,1fr)] gap-2 items-start py-1.5 rounded-lg"
      style={{ opacity: faded ? 0.55 : 1, background: tag && !faded ? soft(tag.color, 7) : undefined }}>
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
        {tag && (
          <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold px-1.5 py-px rounded-full"
            style={{ background: soft(tag.color, 16), color: tag.color }}>
            {tag.icon && <tag.icon size={10} />}{tag.label}
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
