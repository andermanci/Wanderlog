import type { SnapshotActivity } from '@/types/database'
import { hhmm, itemsOn } from './snapshot'

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
  /** Número de cambios del día (lo que pinta el punto de la tira de días). */
  changes: number
}

export function diffItineraries(a: SnapshotActivity[], b: SnapshotActivity[], dates: string[]): DayDiff[] {
  const inA = new Map(a.map(x => [x.id, x]))
  const inB = new Map(b.map(x => [x.id, x]))

  return dates.map(date => {
    const dayA = itemsOn(a, date)
    const dayB = itemsOn(b, date)

    const bChanges: ItemChange[] = dayB.map(item => {
      const prev = inA.get(item.id)
      if (!prev) return { activity: item, kind: 'added' }
      const timeChanged = hhmm(prev.start_time) !== hhmm(item.start_time)
      if (prev.date !== date) {
        return { activity: item, kind: 'moved', fromDate: prev.date, fromTime: timeChanged ? hhmm(prev.start_time) : undefined }
      }
      if (timeChanged) return { activity: item, kind: 'time', fromTime: hhmm(prev.start_time) }
      return { activity: item, kind: 'same' }
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

    const changes = bChanges.filter(c => c.kind !== 'same').length + movedOut.length + removed.length
      + (reordered && changesAreOnlyOrder(bChanges, movedOut, removed) ? 1 : 0)

    return { date, a: dayA, b: bChanges, movedOut, removed, reordered, changes }
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
  daysChanged: number
}

export function totalsOf(diff: DayDiff[]): DiffTotals {
  let moved = 0, time = 0, added = 0, removed = 0, daysChanged = 0
  for (const d of diff) {
    for (const c of d.b) {
      if (c.kind === 'moved') moved++
      else if (c.kind === 'time') time++
      else if (c.kind === 'added') added++
    }
    removed += d.removed.length
    if (d.changes > 0) daysChanged++
  }
  return { moved, time, added, removed, daysChanged }
}
