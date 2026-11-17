import { Fragment, useState, type ReactNode } from 'react'
import {
  AlertTriangle, BusFront, Car, CarTaxiFront, ChevronDown, ChevronRight, Clock, ExternalLink, Footprints,
  Lightbulb, MapPin, RotateCcw, Ship, Ticket, TrainFront, TramFront, type LucideIcon,
} from 'lucide-react'
import { Button, Card, Notice } from '@/design'
import { cn } from '@/lib/utils'
import type { GeoPoint, TravelLeg } from '@/lib/travelTime'
import { stationMapUrl, directionsUrl } from '@/lib/directions'
import { transitVerdict, walkMeters, type TransitVerdict } from '@/lib/transit/exchange'
import type { TransitAlternative, TransitRoute, TransitStep } from '@/types/database'
import { ALTERNATIVE_TITLE, SKIP_REASON, verdictExplanation, WALK_RELEVANT_MAX_MIN } from '@/lib/transit/labels'

function rideIcon(kind: TransitStep['kind']): LucideIcon {
  switch (kind) {
    case 'bus': return BusFront
    case 'tram': return TramFront
    case 'ferry': return Ship
    default: return TrainFront
  }
}

// El color de cada línea viene de los datos (el verde de la Yamanote, el gris
// de la Hibiya): es el único sitio donde se pinta con `style`. La tinta se
// calcula a partir de ese color (negro o blanco) para que se lea siempre, en
// claro y en oscuro. Sin color, la línea usa el color principal del tema.
function lineStyle(hex: string | null | undefined): { backgroundColor: string; color: string } | undefined {
  if (!hex) return undefined
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return { backgroundColor: hex, color: (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? 'black' : 'white' }
}
const NO_LINE_COLOR = 'bg-primary text-primary-foreground'

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

const km = (from: GeoPoint, to: GeoPoint) =>
  (walkMeters(from, to) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Las líneas de una ruta como pastillas de su color: [Ginza] › [JR Yamanote]. */
// `pill`: dentro de una píldora redonda (el conector), los chips también son
// redondos para que los radios casen.
export function LineChips({ steps, max = 4, pill = false }: { steps: TransitStep[]; max?: number; pill?: boolean }) {
  const rides = steps.filter(s => s.kind !== 'walk')
  const shown = rides.slice(0, max)
  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      {shown.map((s, i) => {
        const Icon = rideIcon(s.kind)
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden="true" />}
            <span
              className={cn(
                'inline-flex max-w-36 items-center gap-1 truncate py-0.5 text-2xs font-semibold',
                pill ? 'rounded-full px-2' : 'rounded-md px-1.5',
                !s.line_color && NO_LINE_COLOR,
              )}
              style={lineStyle(s.line_color)}
            >
              <Icon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{shortLine(s.line)}</span>
            </span>
          </Fragment>
        )
      })}
      {rides.length > max && <span className="ml-0.5 text-2xs text-muted-foreground">+{rides.length - max}</span>}
    </span>
  )
}

type Rail = { kind: 'walk' } | { kind: 'ride'; color: string | null } | null

type Item =
  | { type: 'place'; name: string }
  | { type: 'station'; name: string; near: GeoPoint; exact: boolean; kind: string; color: string | null; transfer: boolean; transferMinutes?: number | null }
  | { type: 'walk'; minutes: number | null; last: boolean }
  | { type: 'ride'; step: TransitStep; color: string | null }

function buildItems(steps: TransitStep[], fromName: string, toName: string, from: GeoPoint, to: GeoPoint): Item[] {
  const items: Item[] = [{ type: 'place', name: fromName }]
  const rides = steps.filter(s => s.kind !== 'walk')
  steps.forEach((s, i) => {
    if (s.kind === 'walk') {
      items.push({ type: 'walk', minutes: s.minutes, last: i === steps.length - 1 })
      return
    }
    const color = s.line_color
    const isFirst = rides[0] === s
    const prev = items[items.length - 1]
    const before = items[items.length - 2]
    // Bajar y subir en la misma estación: un único punto de transbordo.
    if (prev?.type === 'station' && s.from_station && prev.name === s.from_station) {
      prev.transfer = true
      prev.color = color
    } else if (prev?.type === 'walk' && before?.type === 'station' && s.from_station && before.name === s.from_station) {
      // Igual, con unos minutos a pie por dentro: se cuentan en el propio punto.
      items.pop()
      before.transfer = true
      before.transferMinutes = prev.minutes
      before.color = color
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
    ? <div className={cn(className, 'w-0 border-l-2 border-dotted border-muted-foreground/45')} />
    : <div className={cn(className, 'w-1', !rail.color && 'bg-primary')} style={rail.color ? { backgroundColor: rail.color } : undefined} />
}

// Las paradas del tramo (plegadas) y, si no cuadran con la subida y la
// bajada, un aviso para revisarlo en Google Maps.
function RideStations({ step }: { step: TransitStep }) {
  const [open, setOpen] = useState(false)
  const middle = (step.stations ?? []).slice(1, -1)
  return (
    <>
      {step.doubtful && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Revisa este tramo: las estaciones que dio la IA no empiezan o no acaban donde subes o bajas.
        </p>
      )}
      {middle.length > 0 && (
        <div>
          <button
            type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="-my-1 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            {open ? 'Ocultar paradas' : `Ver las ${middle.length} ${middle.length === 1 ? 'parada intermedia' : 'paradas intermedias'}`}
          </button>
          {open && (
            <ol
              className={cn('mt-1 ml-1.5 space-y-0.5 border-l-2 pl-3 text-xs text-muted-foreground', !step.line_color && 'border-border-strong')}
              style={step.line_color ? { borderColor: step.line_color } : undefined}
            >
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
          const RideIcon = it.type === 'ride' ? rideIcon(it.step.kind) : null
          return (
            <li key={i} className="flex gap-3">
              <div className="flex w-4 shrink-0 justify-center"><RailLine rail={railOf(it)} className="h-full" /></div>
              {it.type === 'walk' ? (
                <p className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground">
                  <Footprints className="size-4" aria-hidden="true" />
                  {it.minutes ? `${it.minutes} min andando` : 'Andando'}
                </p>
              ) : (
                <div className="min-w-0 space-y-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', !it.color && NO_LINE_COLOR)}
                      style={lineStyle(it.color)}
                    >
                      {RideIcon && <RideIcon className="size-3.5" aria-hidden="true" />}
                      {it.step.line ?? 'Línea'}
                    </span>
                    {it.step.operator && <span className="text-xs text-muted-foreground">{it.step.operator}</span>}
                  </div>
                  {it.step.direction && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Dirección </span>
                      <span className="font-medium">{it.step.direction}</span>
                    </p>
                  )}
                  <p className="text-xs tabular-nums text-muted-foreground">
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

        const { main, sub } = splitName(it.name)
        return (
          <li key={i} className="flex gap-3">
            <div className="flex w-4 shrink-0 flex-col items-center">
              <RailLine rail={above} className="min-h-1 flex-1" />
              {it.type === 'station' ? (
                <span
                  className={cn('size-3.5 shrink-0 rounded-full border-[3px] bg-card', !it.color && 'border-primary')}
                  style={it.color ? { borderColor: it.color } : undefined}
                />
              ) : (
                <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/50" />
              )}
              <RailLine rail={below} className="min-h-1 flex-1" />
            </div>
            {it.type === 'station' ? (
              <a
                href={stationMapUrl(it.name, it.near, it.kind, it.exact)}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver la estación en el mapa"
                className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-semibold leading-tight group-hover:text-primary">{main}</span>
                  {(sub || it.transfer) && (
                    <span className="block truncate text-xs leading-tight text-muted-foreground">
                      {[sub, it.transfer ? `transbordo${it.transferMinutes ? ` · ${it.transferMinutes} min a pie` : ''}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <MapPin className="ml-auto size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                <span className="sr-only">Ver la estación en el mapa</span>
              </a>
            ) : (
              <p className="truncate py-1 text-sm text-muted-foreground">{main}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const ALT: Record<TransitAlternative, { title: string; icon: LucideIcon; mode: 'walking' | 'driving' }> = {
  walk: { title: ALTERNATIVE_TITLE.walk, icon: Footprints, mode: 'walking' },
  taxi: { title: ALTERNATIVE_TITLE.taxi, icon: CarTaxiFront, mode: 'driving' },
  car: { title: ALTERNATIVE_TITLE.car, icon: Car, mode: 'driving' },
}

export interface TransitStepsProps {
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

const Sheet = ({ children }: { children: ReactNode }) => (
  <Card pad="none" className="my-2 w-full max-w-md overflow-hidden text-left">{children}</Card>
)

function Tip({ text, className }: { text: string; className?: string }) {
  return <Notice tone="warning" icon={Lightbulb} className={cn('mx-4 mb-3', className)}>{text}</Notice>
}

function MapsLink({ from, to, mode, label }: { from: GeoPoint; to: GeoPoint; mode: 'transit' | 'walking' | 'driving'; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={directionsUrl(from, to, mode)} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" /> {label}
      </a>
    </Button>
  )
}

// Pie de la ficha: abrir en Google Maps y, si se puede editar, volver a pedir
// solo este trayecto a la IA.
function Actions({ children, onRedo }: { children: ReactNode; onRedo?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
      {children}
      {onRedo && (
        <Button
          variant="ghost" size="sm" onClick={onRedo}
          title="¿No cuadra con Google Maps? Pídeselo otra vez a la IA solo para este trayecto"
        >
          <RotateCcw aria-hidden="true" /> Pedir de nuevo este trayecto
        </Button>
      )}
    </div>
  )
}

interface CompareRow {
  key: string
  icon: LucideIcon
  label: string
  minutes: number
  best: boolean
  /** Trozos de la barra; sin trozos, una barra lisa. */
  parts?: { walk: number; wait: number; ride: number; color: string | null }
  detail?: string | null
}

// Andando: a rayas. Esperando: gris claro. A bordo: el color de la línea.
const WALK_FILL = 'bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--muted-foreground)_50%,transparent)_0_3px,transparent_3px_5px)]'
const WAIT_FILL = 'bg-muted-foreground/20'

// Las opciones lado a lado. La de transporte público va troceada (andando a
// rayas, esperando en gris claro, en el vehículo con el color de la línea):
// así se ve de un vistazo cuánto se camina en cada caso.
function Compare({ rows }: { rows: CompareRow[] }) {
  const max = Math.max(...rows.map(r => r.minutes))
  const pct = (m: number) => `${(m / max) * 100}%`
  const parts = rows.find(r => r.parts)?.parts
  return (
    <div className="space-y-2 px-4 pb-3">
      <ul className="space-y-2" aria-label="Comparación de opciones">
        {rows.map(r => (
          <li key={r.key} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs">
            <span className={cn('flex items-center gap-1.5', r.best ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              <r.icon className="size-3.5 shrink-0" aria-hidden="true" />{r.label}
            </span>
            <span className="flex h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              {r.parts ? (
                <>
                  <span className={WALK_FILL} style={{ width: pct(r.parts.walk) }} />
                  <span className={WAIT_FILL} style={{ width: pct(r.parts.wait) }} />
                  <span
                    className={cn(!r.parts.color && 'bg-primary')}
                    style={{ width: pct(r.parts.ride), ...(r.parts.color ? { backgroundColor: r.parts.color } : null) }}
                  />
                </>
              ) : (
                <span
                  className={cn('rounded-full', r.key === 'walk' ? WALK_FILL : r.best ? 'bg-primary' : 'bg-muted-foreground/35')}
                  style={{ width: pct(r.minutes) }}
                />
              )}
            </span>
            <span className={cn('whitespace-nowrap text-right tabular-nums', r.best ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {r.minutes} min{r.detail && <span className="font-normal text-muted-foreground"> · {r.detail}</span>}
              {r.best && <span className="sr-only"> (la mejor opción)</span>}
            </span>
          </li>
        ))}
      </ul>
      {parts && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className={cn('h-2 w-3 rounded-sm', WALK_FILL)} />andando</span>
          <span className="flex items-center gap-1"><span className={cn('h-2 w-3 rounded-sm', WAIT_FILL)} />esperando</span>
          <span className="flex items-center gap-1">
            <span className={cn('h-2 w-3 rounded-sm', !parts.color && 'bg-primary')} style={parts.color ? { backgroundColor: parts.color } : undefined} />
            a bordo
          </span>
        </p>
      )}
    </div>
  )
}

// Las filas de la comparación: transporte público (troceado), andando y, si
// se conoce, el coche o el taxi.
function compareRows(route: TransitRoute, v: TransitVerdict, from: GeoPoint, to: GeoPoint, drive: TravelLeg | undefined): CompareRow[] {
  const b = v.breakdown
  const rideColor = (route.steps ?? []).find(s => s.kind !== 'walk')?.line_color ?? null
  const driveMin = drive ? Math.max(1, Math.round(drive.durationSeconds / 60)) : null
  const rows: (CompareRow | null)[] = [
    b ? { key: 'transit', icon: TrainFront, label: 'Transporte', minutes: b.total, best: v.worth, parts: { ...b, color: rideColor }, detail: `${b.walk} andando` } : null,
    // Andar a más de una hora no es una opción: su barra solo aplastaría al resto.
    v.walkMinutes <= WALK_RELEVANT_MAX_MIN || (!v.worth && v.alternative === 'walk')
      ? { key: 'walk', icon: Footprints, label: 'Andando', minutes: v.walkMinutes, best: !v.worth && v.alternative === 'walk', detail: v.coordsSuspect ? 'según la IA' : `${km(from, to)} km` }
      : null,
    driveMin != null
      ? { key: 'car', icon: v.alternative === 'taxi' ? CarTaxiFront : Car, label: v.alternative === 'taxi' ? 'Taxi' : 'Coche', minutes: driveMin, best: !v.worth && v.alternative !== 'walk' }
      : null,
  ]
  return rows.filter((r): r is CompareRow => !!r)
}

function Explanation({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="px-4 pb-3 text-sm leading-relaxed">{text}</p>
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
    <Sheet>
      <div className="flex items-center gap-3.5 border-b border-border px-4 py-3.5">
        {route.total_minutes != null && (
          <span className="flex shrink-0 items-baseline gap-1">
            <span className="title-page tabular-nums">{route.total_minutes}</span>
            <span className="text-sm text-muted-foreground">min</span>
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <LineChips steps={steps} />
          {/* En el móvil el precio largo no cabe al lado: baja a su línea. */}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="size-3.5 shrink-0" aria-hidden="true" />de puerta a puerta</span>
            {route.fare_text && <span className="flex min-w-0 items-center gap-1"><Ticket className="size-3.5 shrink-0" aria-hidden="true" />{route.fare_text}</span>}
          </span>
        </div>
      </div>
      {items.length > 0 && <Timeline items={items} />}
      {route.note && <Tip text={route.note} className={items.length ? undefined : 'mt-3'} />}
      <div className="border-t border-border pt-3">
        <Explanation text={verdictExplanation(verdict, firstLine)} />
        <Compare rows={compareRows(route, verdict, from, to, props.drive)} />
      </div>
      <Actions onRedo={onRedo}>
        <MapsLink from={from} to={to} mode="transit" label="Abrir en Google Maps" />
      </Actions>
    </Sheet>
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
    <Sheet>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-accent-foreground">
          <AltIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="title-card">{title}</p>
          <p className="text-sm text-muted-foreground">{SKIP_REASON[verdict.reason ?? 'otro']}</p>
        </div>
      </div>

      <Explanation text={verdictExplanation(verdict, firstLine)} />
      {verdict.coordsSuspect && (
        <Notice tone="warning" icon={AlertTriangle} className="mx-4 mb-3">
          En el mapa «{fromName}» y «{toName}» están a {km(from, to)} km, pero la IA dice {verdict.walkMinutes} min
          andando: seguramente una de las dos está mal ubicada. Corrige su dirección y se recalcula.
        </Notice>
      )}
      {rows.length > 1 && <Compare rows={rows} />}

      {route.note && <Tip text={route.note} />}

      {items.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button" onClick={() => setShowRoute(s => !s)} aria-expanded={showRoute}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          >
            <TrainFront className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Ver igualmente la opción en transporte público</span>
            <LineChips steps={steps} max={2} />
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', showRoute && 'rotate-180')} aria-hidden="true" />
          </button>
          {showRoute && <Timeline items={items} />}
        </div>
      )}

      <Actions onRedo={onRedo}>
        <MapsLink from={from} to={to} mode={mode} label={alt === 'walk' ? 'Ir andando en Google Maps' : 'En coche en Google Maps'} />
        <MapsLink from={from} to={to} mode="transit" label="En transporte público" />
      </Actions>
    </Sheet>
  )
}
