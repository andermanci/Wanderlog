import type { SnapshotActivity, TransitRoute, VersionTransit } from '@/types/database'
import {
  entryPoint, exitPoint, haversineKm, pairKey, transitSig, MAX_CONNECTOR_KM, WALK_THRESHOLD_KM, type GeoPoint,
} from '@/lib/travelTime'
import { transitVerdict, type TransitVerdict } from '@/lib/transit/exchange'
import type { Activity } from '@/types/database'
import { sequenceOn } from './snapshot'

// Los trayectos de un día de una versión, con su ruta en transporte público
// si la versión la trae y sigue valiendo (los extremos no se han movido).
// Sin Google: la distancia es en línea recta y el tiempo sale de la ruta.

export interface VersionLeg {
  key: string
  from: SnapshotActivity
  to: SnapshotActivity
  origin: GeoPoint
  destination: GeoPoint
  km: number
  /** Más de 1,1 km: el itinerario lo pinta en coche y admite ruta. */
  long: boolean
  route: VersionTransit | null
  verdict: TransitVerdict | null
}

// SnapshotActivity tiene los mismos campos de ubicación que Activity.
const asActivity = (a: SnapshotActivity) => a as unknown as Activity

export function indexTransit(transit: VersionTransit[] | null | undefined): Map<string, VersionTransit> {
  return new Map((transit ?? []).map(r => [pairKey(r.from_activity_id, r.to_activity_id), r]))
}

export function legsOn(snap: SnapshotActivity[], routes: Map<string, VersionTransit>, date: string): VersionLeg[] {
  const seq = sequenceOn(snap, date)
  const legs: VersionLeg[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    const origin = exitPoint(asActivity(seq[i]))
    const destination = entryPoint(asActivity(seq[i + 1]))
    if (!origin || !destination) continue
    const km = haversineKm(origin, destination)
    if (km > MAX_CONNECTOR_KM) continue
    const key = pairKey(seq[i].id, seq[i + 1].id)
    const saved = routes.get(key)
    const route = saved && saved.coords_sig === transitSig(origin, destination) ? saved : null
    legs.push({
      key, from: seq[i], to: seq[i + 1], origin, destination, km,
      long: km > WALK_THRESHOLD_KM,
      route,
      verdict: route ? transitVerdict(route as TransitRoute, origin, destination) : null,
    })
  }
  return legs
}

/** Lo que distingue una ruta de otra a ojos de quien viaja. */
export function routeFingerprint(leg: VersionLeg): string {
  if (!leg.route || !leg.verdict) return ''
  return JSON.stringify([
    leg.verdict.worth, leg.verdict.alternative, leg.route.total_minutes,
    (leg.route.steps ?? []).filter(s => s.kind !== 'walk').map(s => [s.line, s.from_station, s.to_station]),
  ])
}

export type LegChange = 'new' | 'changed'

export interface TransitDayDiff {
  a: VersionLeg[]
  b: VersionLeg[]
  /** Trayectos de B cuya ruta es nueva o distinta de la de A. */
  changes: Map<string, LegChange>
  /** Rutas de A que en B ya no están (el trayecto desaparece o se queda sin ruta). */
  dropped: Set<string>
}

export function diffTransit(a: VersionLeg[], b: VersionLeg[]): TransitDayDiff {
  const inA = new Map(a.filter(l => l.route).map(l => [l.key, l]))
  const inB = new Map(b.filter(l => l.route).map(l => [l.key, l]))
  const changes = new Map<string, LegChange>()
  for (const [key, leg] of inB) {
    const prev = inA.get(key)
    if (!prev) changes.set(key, 'new')
    else if (routeFingerprint(prev) !== routeFingerprint(leg)) changes.set(key, 'changed')
  }
  const dropped = new Set([...inA.keys()].filter(k => !inB.has(k)))
  return { a, b, changes, dropped }
}

/** Minutos del día en los trayectos con ruta (transporte público o andando). */
export function transitMinutes(legs: VersionLeg[]): number {
  return legs.reduce((n, l) => {
    if (!l.route || !l.verdict) return n
    if (l.verdict.worth) return n + (l.route.total_minutes ?? 0)
    return l.verdict.alternative === 'walk' ? n + l.verdict.walkMinutes : n
  }, 0)
}
