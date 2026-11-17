import { Fragment } from 'react'
import { Footprints, TrainFront, TramFront, BusFront, Ship, ChevronRight, Lightbulb, Navigation, Ticket, Clock } from 'lucide-react'
import type { GeoPoint } from '@/lib/travelTime'
import { stationMapUrl, transitDirectionsUrl } from '@/lib/directions'
import type { TransitRoute, TransitStep } from '@/types/database'

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
  | { type: 'station'; name: string; near: GeoPoint; kind: string; color: string; transfer: boolean }
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
      items.push({ type: 'station', name: s.from_station, near: isFirst ? from : to, kind: s.kind, color, transfer: !isFirst })
    }
    items.push({ type: 'ride', step: s, color })
    if (s.to_station) items.push({ type: 'station', name: s.to_station, near: to, kind: s.kind, color, transfer: false })
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

interface TransitStepsProps {
  route: TransitRoute
  from: GeoPoint
  to: GeoPoint
  fromName: string
  toName: string
}

// La ruta como una línea de metro vertical: de dónde sales, cuánto andas,
// dónde subes (con el color de la línea), cuántas paradas y hacia dónde, dónde
// bajas o transbordas, y adónde llegas. Las estaciones abren el mapa.
export function TransitSteps({ route, from, to, fromName, toName }: TransitStepsProps) {
  const steps = route.steps ?? []
  const items = steps.length ? buildItems(steps, fromName, toName, from, to) : []

  return (
    <div
      className="w-full max-w-sm rounded-2xl border border-border my-1.5 text-left overflow-hidden shadow-sm"
      style={{ background: 'var(--card)' }}
    >
      {route.worth_it && (
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
      )}

      {items.length > 0 && (
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
                        ].filter(Boolean).join(' · ')}
                      </p>
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
                    href={stationMapUrl(it.name, it.near, it.kind)}
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
      )}

      {route.note && (
        <p className={`mx-3 mb-3 ${items.length ? '' : 'mt-3'} flex gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed`}
          style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
          <Lightbulb size={14} className="shrink-0 mt-px" style={{ color: 'var(--warning)' }} aria-hidden="true" />
          <span>{route.note}</span>
        </p>
      )}

      <a
        href={transitDirectionsUrl(from, to)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-primary hover:bg-secondary transition-colors"
      >
        Ver horarios de hoy en Google Maps
      </a>
    </div>
  )
}
