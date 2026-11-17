import { Fragment, useState } from 'react'
import { Footprints, TrainFront, TramFront, BusFront, Ship, ChevronRight, ChevronDown, Lightbulb, Navigation, Ticket, Clock, Car, CarTaxiFront, AlertTriangle, RotateCcw } from 'lucide-react'
import type { GeoPoint, TravelLeg } from '@/lib/travelTime'
import { stationMapUrl, directionsUrl } from '@/lib/directions'
import { transitVerdict, walkMeters, type TransitVerdict } from '@/lib/transit/exchange'
import type { TransitAlternative, TransitRoute, TransitStep } from '@/types/database'
import { ALTERNATIVE_TITLE, SKIP_REASON, verdictExplanation } from '@/lib/transit/labels'

const FALLBACK = 'var(--primary)'

function rideIcon(kind: TransitStep['kind']) {
  switch (kind) {
    case 'bus': return BusFront
    case 'tram': return TramFront
    case 'ferry': return Ship
    default: return TrainFront
  }
}

// Texto legible sobre el color de la línea (la Yamanote es verde claro, la
// Hibiya gris: con blanco no se leerían).
function inkFor(hex: string | null): string {
  if (!hex) return 'var(--primary-foreground)'
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1a1a1a' : '#fff'
}

// "Ginza Line (G)" → "Ginza"; "JR Yamanote Line" → "JR Yamanote". Para la
// píldora, donde el ancho es oro.
function shortLine(line: string | null): string {
  if (!line) return 'Línea'
  return line.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+line$/i, '').trim() || line
}

// "Asakusa (浅草)" → { main: "Asakusa", sub: "浅草" }
function splitName(name: string): { main: string; sub: string | null } {
  const m = name.match(/^(.*?)\s*\((.+)\)\s*$/)
  return m ? { main: m[1], sub: m[2] } : { main: name, sub: null }
}

/** Las líneas de una ruta como pastillas de su color: [Ginza] › [JR Yamanote]. */
// `pill`: dentro de una píldora redonda (el conector), los chips también son
// redondos para que los radios casen.
export function LineChips({ steps, max = 4, pill = false }: { steps: TransitStep[]; max?: number; pill?: boolean }) {
  const rides = steps.filter(s => s.kind !== 'walk')
  const shown = rides.slice(0, max)
  return (
    <span className="inline-flex items-center gap-0.5 min-w-0">
      {shown.map((s, i) => {
        const Icon = rideIcon(s.kind)
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={10} className="shrink-0 opacity-40" aria-hidden="true" />}
            <span
              className={`inline-flex items-center gap-0.5 py-px text-[10.5px] font-semibold leading-4 truncate max-w-[9rem] ${pill ? 'rounded-full px-2' : 'rounded-[5px] px-1.5'}`}
              style={{ background: s.line_color ?? FALLBACK, color: inkFor(s.line_color) }}
            >
              <Icon size={10} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{shortLine(s.line)}</span>
            </span>
          </Fragment>
        )
      })}
      {rides.length > max && <span className="text-[10px] opacity-60 ml-0.5">+{rides.length - max}</span>}
    </span>
  )
}

type Rail = { kind: 'walk' } | { kind: 'ride'; color: string } | null

type Item =
  | { type: 'place'; name: string }
  | { type: 'station'; name: string; near: GeoPoint; exact: boolean; kind: string; color: string; transfer: boolean }
  | { type: 'walk'; minutes: number | null; last: boolean }
  | { type: 'ride'; step: TransitStep; color: string }

function buildItems(steps: TransitStep[], fromName: string, toName: string, from: GeoPoint, to: GeoPoint): Item[] {
  const items: Item[] = [{ type: 'place', name: fromName }]
  const rides = steps.filter(s => s.kind !== 'walk')
  steps.forEach((s, i) => {
    if (s.kind === 'walk') {
      items.push({ type: 'walk', minutes: s.minutes, last: i === steps.length - 1 })
      return
    }
    const color = s.line_color ?? FALLBACK
    const isFirst = rides[0] === s
    const prev = items[items.length - 1]
    // Bajar y subir en la misma estación: un único punto de transbordo.
    if (prev?.type === 'station' && s.from_station && prev.name === s.from_station) {
      prev.transfer = true
      prev.color = color
    } else if (s.from_station) {
      items.push({ type: 'station', name: s.from_station, near: s.from_coords ?? (isFirst ? from : to), exact: !!s.from_coords, kind: s.kind, color, transfer: !isFirst })
    }
    items.push({ type: 'ride', step: s, color })
    if (s.to_station) items.push({ type: 'station', name: s.to_station, near: s.to_coords ?? to, exact: !!s.to_coords, kind: s.kind, color, transfer: false })
  })
  items.push({ type: 'place', name: toName })
  return items
}

const railOf = (it: Item | undefined): Rail =>
  !it ? null : it.type === 'walk' ? { kind: 'walk' } : it.type === 'ride' ? { kind: 'ride', color: it.color } : null

function RailLine({ rail, className }: { rail: Rail; className?: string }) {
  if (!rail) return <div className={className} />
  return rail.kind === 'walk'
    ? <div className={`${className} w-0 border-l-2 border-dotted`} style={{ borderColor: 'var(--muted-foreground)', opacity: 0.45 }} />
    : <div className={`${className} w-1`} style={{ background: rail.color }} />
}

// Las paradas del tramo (plegadas) y, si no cuadran con la subida y la
// bajada, un aviso para revisarlo en Google Maps.
function RideStations({ step }: { step: TransitStep }) {
  const [open, setOpen] = useState(false)
  const middle = (step.stations ?? []).slice(1, -1)
  return (
    <>
      {step.doubtful && (
        <p className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
          style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--warning)' }}
          title="La lista de estaciones que dio la IA no empieza o no acaba donde dice que subes o bajas">
          <AlertTriangle size={11} aria-hidden="true" /> Revisa este tramo
        </p>
      )}
      {middle.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown size={11} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
            {open ? 'Ocultar paradas' : `Ver las ${middle.length} ${middle.length === 1 ? 'parada intermedia' : 'paradas intermedias'}`}
          </button>
          {open && (
            <ol className="mt-1 ml-1 pl-2.5 border-l-2 space-y-0.5 text-[11px] text-muted-foreground" style={{ borderColor: step.line_color ?? 'var(--border)' }}>
              {middle.map((n, i) => <li key={i}>{n}</li>)}
            </ol>
          )}
        </div>
      )}
    </>
  )
}

function Timeline({ items }: { items: Item[] }) {
  return (
    <ol className="px-4 py-3">
      {items.map((it, i) => {
        const above = railOf(items[i - 1])
        const below = railOf(items[i + 1])

        if (it.type === 'walk' || it.type === 'ride') {
          return (
            <li key={i} className="flex gap-3">
              <div className="w-4 flex justify-center shrink-0"><RailLine rail={railOf(it)} className="h-full" /></div>
              {it.type === 'walk' ? (
                <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                  <Footprints size={13} aria-hidden="true" />
                  {it.minutes ? `${it.minutes} min andando` : 'Andando'}
                </p>
              ) : (
                <div className="py-2.5 space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{ background: it.color, color: inkFor(it.step.line_color) }}
                    >
                      {(() => { const I = rideIcon(it.step.kind); return <I size={11} aria-hidden="true" /> })()}
                      {it.step.line ?? 'Línea'}
                    </span>
                    {it.step.operator && <span className="text-[11px] text-muted-foreground">{it.step.operator}</span>}
                  </div>
                  {it.step.direction && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Dirección </span>
                      <span className="font-medium">{it.step.direction}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {[
                      it.step.stops != null ? `${it.step.stops} ${it.step.stops === 1 ? 'parada' : 'paradas'}` : null,
                      it.step.minutes != null ? `${it.step.minutes} min` : null,
                      it.step.wait != null ? `espera ≈ ${it.step.wait} min` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  <RideStations step={it.step} />
                </div>
              )}
            </li>
          )
        }

        const isStation = it.type === 'station'
        const { main, sub } = splitName(it.name)
        return (
          <li key={i} className="flex gap-3">
            <div className="w-4 flex flex-col items-center shrink-0">
              <RailLine rail={above} className="flex-1 min-h-1" />
              {isStation ? (
                <span className="w-3.5 h-3.5 rounded-full shrink-0 border-[3px]"
                  style={{ borderColor: it.color, background: 'var(--card)' }} />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--muted-foreground)', opacity: 0.5 }} />
              )}
              <RailLine rail={below} className="flex-1 min-h-1" />
            </div>
            {isStation ? (
              <a
                href={stationMapUrl(it.name, it.near, it.kind, it.exact)}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver la estación en el mapa"
                className="group flex-1 min-w-0 py-1 flex items-center gap-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight group-hover:text-primary truncate">{main}</span>
                  {(sub || it.transfer) && (
                    <span className="block text-[11px] text-muted-foreground leading-tight truncate">
                      {[sub, it.transfer ? 'transbordo' : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <Navigation size={12} className="shrink-0 ml-auto text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary" aria-hidden="true" />
              </a>
            ) : (
              <p className="py-1 text-xs text-muted-foreground truncate">{main}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const ALT: Record<TransitAlternative, { title: string; icon: typeof Car; mode: 'walking' | 'driving' }> = {
  walk: { title: ALTERNATIVE_TITLE.walk, icon: Footprints, mode: 'walking' },
  taxi: { title: ALTERNATIVE_TITLE.taxi, icon: CarTaxiFront, mode: 'driving' },
  car: { title: ALTERNATIVE_TITLE.car, icon: Car, mode: 'driving' },
}

interface TransitStepsProps {
  route: TransitRoute
  from: GeoPoint
  to: GeoPoint
  fromName: string
  toName: string
  /** El trayecto en coche (si ya se calculó), para comparar. */
  drive?: TravelLeg
  /** Pedir de nuevo solo este trayecto (si se puede editar el viaje). */
  onRedo?: () => void
}

function RedoButton({ onRedo }: { onRedo?: () => void }) {
  if (!onRedo) return null
  return (
    <button type="button" onClick={onRedo}
      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      title="¿No cuadra con Google Maps? Pídeselo otra vez a la IA solo para este trayecto">
      <RotateCcw size={12} aria-hidden="true" /> Corregir
    </button>
  )
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-sm rounded-2xl border border-border my-1.5 text-left overflow-hidden shadow-sm" style={{ background: 'var(--card)' }}>
    {children}
  </div>
)

function Tip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`mx-3 mb-3 flex gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${className}`}
      style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
      <Lightbulb size={14} className="shrink-0 mt-px" style={{ color: 'var(--warning)' }} aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}

function MapsLink({ from, to, mode, label }: { from: GeoPoint; to: GeoPoint; mode: 'transit' | 'walking' | 'driving'; label: string }) {
  return (
    <a
      href={directionsUrl(from, to, mode)}
      title="Abrir en Google Maps"
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary hover:bg-secondary transition-colors"
    >
      {label}
    </a>
  )
}

interface CompareRow {
  key: string
  icon: typeof Car
  label: string
  minutes: number
  best: boolean
  /** Trozos de la barra; sin trozos, una barra lisa. */
  parts?: { walk: number; wait: number; ride: number; color: string }
  detail?: string | null
}

const WALK_FILL = 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--muted-foreground) 45%, transparent) 0 3px, transparent 3px 5px)'
const WAIT_FILL = 'color-mix(in srgb, var(--muted-foreground) 18%, transparent)'

// Las opciones lado a lado. La de transporte público va troceada (andando a
// rayas, esperando en gris claro, en el vehículo con el color de la línea):
// así se ve de un vistazo cuánto se camina en cada caso.
function Compare({ rows }: { rows: CompareRow[] }) {
  const max = Math.max(...rows.map(r => r.minutes))
  const pct = (m: number) => `${(m / max) * 100}%`
  return (
    <div className="px-4 pb-3 space-y-2">
      <ul className="space-y-2" aria-label="Comparación de opciones">
        {rows.map(r => (
          <li key={r.key} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className={`flex items-center gap-1.5 ${r.best ? 'font-semibold' : 'text-muted-foreground'}`}>
              <r.icon size={13} aria-hidden="true" />{r.label}
            </span>
            <span className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--secondary)', opacity: r.best ? 1 : 0.85 }}>
              {r.parts ? (
                <>
                  <span style={{ width: pct(r.parts.walk), background: WALK_FILL }} />
                  <span style={{ width: pct(r.parts.wait), background: WAIT_FILL }} />
                  <span style={{ width: pct(r.parts.ride), background: r.parts.color }} />
                </>
              ) : (
                <span className="rounded-full" style={{
                  width: pct(r.minutes),
                  background: r.key === 'walk' ? WALK_FILL : r.best ? 'var(--primary)' : 'color-mix(in srgb, var(--muted-foreground) 35%, transparent)',
                }} />
              )}
            </span>
            <span className={`tabular-nums text-right whitespace-nowrap ${r.best ? 'font-semibold' : 'text-muted-foreground'}`}>
              {r.minutes} min{r.detail && <span className="font-normal text-muted-foreground"> · {r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {rows.some(r => r.parts) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:pl-[6rem]">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: WALK_FILL }} />andando</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: WAIT_FILL }} />esperando</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: 'var(--primary)' }} />a bordo</span>
        </p>
      )}
    </div>
  )
}

// Las filas de la comparación: transporte público (troceado), andando y, si
// se conoce, el coche o el taxi.
function compareRows(route: TransitRoute, v: TransitVerdict, from: GeoPoint, to: GeoPoint, drive: TravelLeg | undefined): CompareRow[] {
  const b = v.breakdown
  const rideColor = (route.steps ?? []).find(s => s.kind !== 'walk')?.line_color ?? 'var(--primary)'
  const driveMin = drive ? Math.max(1, Math.round(drive.durationSeconds / 60)) : null
  const km = (walkMeters(from, to) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })
  const rows: (CompareRow | null)[] = [
    b ? { key: 'transit', icon: TrainFront, label: 'Transporte', minutes: b.total, best: v.worth, parts: { ...b, color: rideColor }, detail: `${b.walk} andando` } : null,
    { key: 'walk', icon: Footprints, label: 'Andando', minutes: v.walkMinutes, best: !v.worth && v.alternative === 'walk', detail: `${km} km` },
    driveMin != null
      ? { key: 'car', icon: v.alternative === 'taxi' ? CarTaxiFront : Car, label: v.alternative === 'taxi' ? 'Taxi' : 'Coche', minutes: driveMin, best: !v.worth && v.alternative !== 'walk' }
      : null,
  ]
  return rows.filter((r): r is CompareRow => !!r)
}

function Explanation({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="px-4 pb-3 text-xs leading-relaxed">{text}</p>
}

// La ruta como una línea de metro vertical: de dónde sales, cuánto andas,
// dónde subes (con el color de la línea), cuántas paradas y hacia dónde, dónde
// bajas o transbordas, y adónde llegas. Las estaciones abren el mapa.
// Si no compensa, la ficha explica por qué y compara las opciones.
export function TransitSteps(props: TransitStepsProps) {
  const { route, from, to, fromName, toName, onRedo } = props
  const verdict = transitVerdict(route, from, to)
  if (!verdict.worth) return <SkipCard {...props} />
  const steps = route.steps ?? []
  const firstLine = steps.find(s => s.kind !== 'walk')?.line ?? null
  const items = steps.length ? buildItems(steps, fromName, toName, from, to) : []

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 border-b border-border">
        {route.total_minutes != null && (
          <span className="flex items-baseline gap-1">
            <span className="font-serif text-2xl font-medium leading-none">{route.total_minutes}</span>
            <span className="text-xs text-muted-foreground">min</span>
          </span>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <LineChips steps={steps} />
          <span className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={11} aria-hidden="true" />puerta a puerta</span>
            {route.fare_text && <span className="flex items-center gap-1 truncate"><Ticket size={11} aria-hidden="true" />{route.fare_text}</span>}
          </span>
        </div>
      </div>
      {items.length > 0 && <Timeline items={items} />}
      {route.note && <Tip text={route.note} className={items.length ? '' : 'mt-3'} />}
      <div className="border-t border-border pt-3">
        <Explanation text={verdictExplanation(verdict, firstLine)} />
        <Compare rows={compareRows(route, verdict, from, to, props.drive)} />
      </div>
      <div className="flex border-t border-border divide-x divide-border">
        <MapsLink from={from} to={to} mode="transit" label="Ver horarios de hoy en Google Maps" />
        <RedoButton onRedo={onRedo} />
      </div>
    </Card>
  )
}

// No compensa: qué hacer en su lugar, por qué, y las opciones lado a lado con
// barras de tiempo para que se vea de un vistazo. Si la IA dio igualmente una
// ruta en transporte público, se puede desplegar.
function SkipCard({ route, from, to, fromName, toName, drive, onRedo }: TransitStepsProps) {
  const [showRoute, setShowRoute] = useState(false)
  const verdict = transitVerdict(route, from, to)
  const alt = verdict.alternative ?? 'car'
  const { title, icon: AltIcon, mode } = ALT[alt]
  const steps = route.steps ?? []
  const items = steps.length ? buildItems(steps, fromName, toName, from, to) : []
  const rows = compareRows(route, verdict, from, to, drive)
  const firstLine = steps.find(s => s.kind !== 'walk')?.line ?? null

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
          <AltIcon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-base font-medium leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">{SKIP_REASON[verdict.reason ?? 'otro']}</p>
        </div>
      </div>

      <Explanation text={verdictExplanation(verdict, firstLine)} />
      {rows.length > 1 && <Compare rows={rows} />}

      {route.note && <Tip text={route.note} />}

      {items.length > 0 && (
        <div className="border-t border-border">
          <button type="button" onClick={() => setShowRoute(s => !s)} aria-expanded={showRoute}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">
            <TrainFront size={13} aria-hidden="true" />
            <span className="flex-1 text-left">Ver igualmente la opción en transporte público</span>
            <LineChips steps={steps} max={2} />
            <ChevronDown size={13} className="transition-transform" style={{ transform: showRoute ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
          </button>
          {showRoute && <Timeline items={items} />}
        </div>
      )}

      <div className="flex border-t border-border divide-x divide-border">
        <MapsLink from={from} to={to} mode={mode} label={alt === 'walk' ? 'Ir andando ↗' : 'En coche ↗'} />
        <MapsLink from={from} to={to} mode="transit" label="En transporte ↗" />
        <RedoButton onRedo={onRedo} />
      </div>
    </Card>
  )
}
