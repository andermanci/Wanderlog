import type { SnapshotActivity, VersionTransit } from '@/types/database'
import { haversineKm } from '@/lib/travelTime'
import { hhmm, itemsOn } from './snapshot'
import { diffTransit, indexTransit, legsOn, type TransitDayDiff } from './transit'

// Qué cambia de la versión A a la B. Se mira desde B (la que se está valorando):
// cada actividad de un día de B dice si viene igual, con otra hora, de otro día
// o si es nueva; y cada día dice qué se ha ido a otro día o desaparece.

export type ChangeKind = 'same' | 'time' | 'moved' | 'added'

export interface ItemChange {
  activity: SnapshotActivity
  kind: ChangeKind
  /** Si kind = 'moved': fecha en la que estaba en A. */
  fromDate?: string
  /** Si kind = 'time' (o 'moved' con hora distinta): hora en A. */
  fromTime?: string | null
  /**
   * La ubicación en el mapa es otra que en A: metros que se ha movido, o
   * 'new' si en A no tenía. Va aparte del `kind`: una actividad puede cambiar
   * de hora y además estar mejor ubicada.
   */
  place?: number | 'new'
}

type Pt = [number | null, number | null]
const pointsOf = (a: SnapshotActivity): Pt[] =>
  [[a.lat, a.lng], [a.origin_lat, a.origin_lng], [a.destination_lat, a.destination_lng]]

/** Por debajo de esto es ruido de geocodificación, no un cambio de sitio. */
const PLACE_MIN_M = 50

export function placeChange(prev: SnapshotActivity, next: SnapshotActivity): number | 'new' | undefined {
  let moved = 0
  let added = false
  pointsOf(prev).forEach(([lat, lng], i) => {
    const [nLat, nLng] = pointsOf(next)[i]
    if (nLat == null || nLng == null) return
    if (lat == null || lng == null) { added = true; return }
    moved = Math.max(moved, haversineKm({ lat, lng }, { lat: nLat, lng: nLng }) * 1000)
  })
  if (moved >= PLACE_MIN_M) return Math.round(moved)
  return added ? 'new' : undefined
}

export interface DayDiff {
  date: string
  a: SnapshotActivity[]
  b: ItemChange[]
  /** De A, se van a otro día en B. */
  movedOut: { activity: SnapshotActivity; toDate: string }[]
  /** De A, no están en B. */
  removed: SnapshotActivity[]
  /** Mismas actividades que en A pero en otro orden. */
  reordered: boolean
  /** Trayectos de cada lado con su ruta en transporte público, y qué cambia. */
  transit: TransitDayDiff
  /** Número de cambios del día (lo que pinta el punto de la tira de días). */
  changes: number
}

export function diffItineraries(
  a: SnapshotActivity[], b: SnapshotActivity[], dates: string[],
  transitA?: VersionTransit[] | null, transitB?: VersionTransit[] | null,
): DayDiff[] {
  const inA = new Map(a.map(x => [x.id, x]))
  const inB = new Map(b.map(x => [x.id, x]))
  const routesA = indexTransit(transitA)
  const routesB = indexTransit(transitB)
  // Si un lado no sabe de trayectos (versión antigua), no se comparan: todo
  // saldría como "nuevo" sin serlo.
  const compareTransit = transitA != null && transitB != null

  return dates.map(date => {
    const dayA = itemsOn(a, date)
    const dayB = itemsOn(b, date)

    const bChanges: ItemChange[] = dayB.map(item => {
      const prev = inA.get(item.id)
      if (!prev) return { activity: item, kind: 'added' }
      const timeChanged = hhmm(prev.start_time) !== hhmm(item.start_time)
      const place = placeChange(prev, item)
      if (prev.date !== date) {
        return { activity: item, kind: 'moved', fromDate: prev.date, fromTime: timeChanged ? hhmm(prev.start_time) : undefined, place }
      }
      if (timeChanged) return { activity: item, kind: 'time', fromTime: hhmm(prev.start_time), place }
      return { activity: item, kind: 'same', place }
    })

    const movedOut: DayDiff['movedOut'] = []
    const removed: SnapshotActivity[] = []
    for (const item of dayA) {
      const next = inB.get(item.id)
      if (!next) removed.push(item)
      else if (next.date !== date) movedOut.push({ activity: item, toDate: next.date })
    }

    const stayingA = dayA.filter(x => inB.get(x.id)?.date === date).map(x => x.id)
    const stayingB = dayB.filter(x => inA.get(x.id)?.date === date).map(x => x.id)
    const reordered = stayingA.join() !== stayingB.join()

    const legsA = legsOn(a, routesA, date)
    const legsB = legsOn(b, routesB, date)
    const transit = compareTransit
      ? diffTransit(legsA, legsB)
      : { a: legsA, b: legsB, changes: new Map(), dropped: new Set<string>() }

    const changes = bChanges.filter(c => c.kind !== 'same' || c.place != null).length + movedOut.length + removed.length
      + (reordered && changesAreOnlyOrder(bChanges, movedOut, removed) ? 1 : 0)
      + transit.changes.size + transit.dropped.size

    return { date, a: dayA, b: bChanges, movedOut, removed, reordered, transit, changes }
  })
}

// Un día en el que solo cambia el orden también cuenta como cambio (uno).
function changesAreOnlyOrder(b: ItemChange[], out: unknown[], removed: unknown[]) {
  return b.every(c => c.kind === 'same') && out.length === 0 && removed.length === 0
}

export interface DiffTotals {
  moved: number
  time: number
  added: number
  removed: number
  /** Actividades con la ubicación corregida o añadida. */
  placed: number
  /** Trayectos con ruta nueva o distinta. */
  transit: number
  daysChanged: number
}

export function totalsOf(diff: DayDiff[]): DiffTotals {
  let moved = 0, time = 0, added = 0, removed = 0, placed = 0, transit = 0, daysChanged = 0
  for (const d of diff) {
    for (const c of d.b) {
      if (c.kind === 'moved') moved++
      else if (c.kind === 'time') time++
      else if (c.kind === 'added') added++
      if (c.place != null) placed++
    }
    transit += d.transit.changes.size
    removed += d.removed.length
    if (d.changes > 0) daysChanged++
  }
  return { moved, time, added, removed, placed, transit, daysChanged }
}
