import { Fragment, useState } from 'react'
import {
  BusFront, Car, CarTaxiFront, ChevronRight, ExternalLink, Footprints, Lightbulb, MapPin, Ship, Ticket, TrainFront,
  TramFront, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, Notice } from '@/design'
import { cn } from '@/lib/utils'
import { directionsUrl, stationMapUrl } from '@/lib/directions'
import { walkMeters } from '@/lib/transit/exchange'
import { ALTERNATIVE_TITLE, SKIP_REASON, verdictExplanation } from '@/lib/transit/labels'
import type { VersionLeg } from '@/lib/versions/transit'
import type { TransitAlternative, TransitStep } from '@/types/database'

// La ficha de un trayecto en transporte público dentro del comparador: cuánto
// se tarda, qué líneas se cogen y dónde, o por qué es mejor ir de otra forma.
// Solo se lee: pedir o corregir rutas se hace en el Plan.

const RIDE_ICONS: Partial<Record<TransitStep['kind'], LucideIcon>> = { bus: BusFront, tram: TramFront, ferry: Ship }

function RideIcon({ kind, className }: { kind: TransitStep['kind']; className?: string }) {
  const Icon = RIDE_ICONS[kind] ?? TrainFront
  return <Icon className={className} aria-hidden="true" />
}

// Tinta legible sobre el color de la línea (la Yamanote es verde claro, la
// Hibiya gris: con blanco no se leerían).
function lightLine(hex: string | null): boolean {
  if (!hex) return false
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
}

// «Ginza Line (G)» → «Ginza»; «JR Yamanote Line» → «JR Yamanote».
function shortLine(line: string | null): string {
  if (!line) return 'Línea'
  return line.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+line$/i, '').trim() || line
}

function LineChip({ step, full }: { step: TransitStep; full?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-36 items-center gap-1 rounded-full px-2 py-px text-2xs font-semibold leading-4',
        !step.line_color ? 'bg-primary text-primary-foreground' : lightLine(step.line_color) ? 'text-black' : 'text-white',
        full && 'max-w-full px-2.5 py-0.5 text-xs',
      )}
      // El color de la línea viene de los datos de la ruta.
      style={step.line_color ? { backgroundColor: step.line_color } : undefined}
    >
      <RideIcon kind={step.kind} className="size-3 shrink-0" />
      <span className="truncate">{full ? step.line ?? 'Línea' : shortLine(step.line)}</span>
    </span>
  )
}

/** Las líneas de una ruta como pastillas de su color: [Ginza] › [JR Yamanote]. */
export function LineChips({ steps, max = 4 }: { steps: TransitStep[] | null; max?: number }) {
  const rides = (steps ?? []).filter(s => s.kind !== 'walk')
  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      {rides.slice(0, max).map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <LineChip step={s} />
        </Fragment>
      ))}
      {rides.length > max && <span className="ml-0.5 text-2xs text-muted-foreground">+{rides.length - max}</span>}
    </span>
  )
}

const ALT: Record<TransitAlternative, { icon: LucideIcon; mode: 'walking' | 'driving'; link: string }> = {
  walk: { icon: Footprints, mode: 'walking', link: 'Ver el camino a pie en Google Maps' },
  taxi: { icon: CarTaxiFront, mode: 'driving', link: 'Ver la ruta en coche en Google Maps' },
  car: { icon: Car, mode: 'driving', link: 'Ver la ruta en coche en Google Maps' },
}

function MapsLink({ href, children }: { href: string; children: string }) {
  return (
    <Button variant="link" size="sm" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer"><ExternalLink /> {children}</a>
    </Button>
  )
}

export function LegDetail({ leg }: { leg: VersionLeg }) {
  const [showRoute, setShowRoute] = useState(false)
  const { route, verdict, origin, destination } = leg
  if (!route || !verdict) return null
  const steps = route.steps ?? []
  const firstLine = steps.find(s => s.kind !== 'walk')?.line ?? null
  const explanation = verdictExplanation(verdict, firstLine)
  const alt = ALT[verdict.alternative ?? 'car']
  const km = (walkMeters(origin, destination) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })

  return (
    <Card sunken pad="sm" className="mt-2 space-y-3">
      {verdict.worth ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {route.total_minutes != null && (
            <p className="title-card tabular-nums">{route.total_minutes} min <span className="text-xs font-normal text-muted-foreground">de puerta a puerta</span></p>
          )}
          <LineChips steps={steps} />
          {route.fare_text && (
            <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Ticket className="size-3.5 shrink-0" aria-hidden="true" /> {route.fare_text}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-foreground">
            <alt.icon className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="title-card">{ALTERNATIVE_TITLE[verdict.alternative ?? 'car']}</p>
            <p className="text-xs text-muted-foreground">{SKIP_REASON[verdict.reason ?? 'otro']}</p>
          </div>
        </div>
      )}

      {explanation && <p className="text-sm leading-relaxed">{explanation}</p>}

      {verdict.coordsSuspect && (
        <Notice tone="warning" icon={TriangleAlert}>
          En el mapa «{leg.from.title}» y «{leg.to.title}» están a {km} km, pero la IA dice {verdict.walkMinutes} min
          andando: seguramente una de las dos está mal ubicada.
        </Notice>
      )}

      {steps.length > 0 && !verdict.worth && (
        <Button variant="link" size="sm" aria-expanded={showRoute} onClick={() => setShowRoute(s => !s)}>
          {showRoute ? 'Ocultar la opción en transporte público' : 'Ver igualmente la opción en transporte público'}
        </Button>
      )}
      {steps.length > 0 && (verdict.worth || showRoute) && <Steps leg={leg} />}

      {route.note && <Notice tone="warning" icon={Lightbulb}>{route.note}</Notice>}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {!verdict.worth && <MapsLink href={directionsUrl(origin, destination, alt.mode)}>{alt.link}</MapsLink>}
        <MapsLink href={directionsUrl(origin, destination, 'transit')}>Ver horarios en Google Maps</MapsLink>
      </div>
    </Card>
  )
}

function Station({ name, href }: { name: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 font-medium underline-offset-4 hover:underline">
      <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{name}</span>
      <span className="sr-only">(abre el mapa)</span>
    </a>
  )
}

// Los pasos en orden: sales, andas, subes en una línea, bajas, llegas.
function Steps({ leg }: { leg: VersionLeg }) {
  const steps = leg.route?.steps ?? []
  const firstRide = steps.find(s => s.kind !== 'walk')
  return (
    <ol className="space-y-2.5 border-l-2 border-border-strong pl-3.5 text-sm">
      <li className="text-xs text-muted-foreground">Sales de {leg.from.title}</li>
      {steps.map((s, i) => {
        if (s.kind === 'walk') {
          return (
            <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
              <Footprints className="size-4 shrink-0" aria-hidden="true" />
              {s.minutes ? `${s.minutes} min andando` : 'Andando'}
            </li>
          )
        }
        const middle = (s.stations ?? []).slice(1, -1)
        const facts = [
          s.stops != null ? `${s.stops} ${s.stops === 1 ? 'parada' : 'paradas'}` : null,
          s.minutes != null ? `${s.minutes} min` : null,
          s.wait != null ? `espera de unos ${s.wait} min` : null,
        ].filter(Boolean).join(' · ')
        return (
          <li key={i} className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <LineChip step={s} full />
              {s.operator && <span className="text-xs text-muted-foreground">{s.operator}</span>}
              {s.doubtful && <Badge tone="warning" icon={TriangleAlert}>Revisa este tramo</Badge>}
            </div>
            {(s.from_station || s.to_station) && (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {s.from_station && (
                  <Station name={s.from_station} href={stationMapUrl(s.from_station, s.from_coords ?? (s === firstRide ? leg.origin : leg.destination), s.kind, !!s.from_coords)} />
                )}
                {s.from_station && s.to_station && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="hasta" />}
                {s.to_station && (
                  <Station name={s.to_station} href={stationMapUrl(s.to_station, s.to_coords ?? leg.destination, s.kind, !!s.to_coords)} />
                )}
              </p>
            )}
            {s.direction && <p className="text-xs"><span className="text-muted-foreground">Dirección </span>{s.direction}</p>}
            {facts && <p className="text-xs tabular-nums text-muted-foreground">{facts}</p>}
            {middle.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer py-1 hover:text-foreground">
                  Ver {middle.length === 1 ? 'la parada intermedia' : `las ${middle.length} paradas intermedias`}
                </summary>
                <ol className="mt-1 space-y-0.5 pl-3">
                  {middle.map((n, j) => <li key={j}>{n}</li>)}
                </ol>
              </details>
            )}
          </li>
        )
      })}
      <li className="text-xs text-muted-foreground">Llegas a {leg.to.title}</li>
    </ol>
  )
}
