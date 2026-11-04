import type { SnapshotActivity } from '@/types/database'
import { haversineKm, type GeoPoint } from '@/lib/travelTime'
import { hhmm, hotelFor, itemsOn } from './snapshot'

// Números para decidir entre dos versiones sin gastar la API de Maps: km en
// línea recta (hotel → visitas → hotel), a qué hora se empieza y se acaba, y
// cuántos días acaban tarde. Es una comparación, no una estimación de viaje:
// el recorrido real es mayor, pero el orden entre versiones se mantiene.

/** A partir de aquí un día "acaba tarde". */
export const LATE_END = '20:00'
/** Tramos más largos que esto son un cambio de ciudad: los hace el tren, no se cuentan. */
const MAX_LEG_KM = 40

const isMove = (a: SnapshotActivity) => a.type === 'transport' || a.type === 'flight'

export function pointOf(a: SnapshotActivity): GeoPoint | null {
  return a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null
}

export interface DayMetrics {
  date: string
  km: number
  visits: number
  start: string | null
  end: string | null
  late: boolean
}

export function dayMetrics(snap: SnapshotActivity[], date: string, prevDate: string | null): DayMetrics {
  const items = itemsOn(snap, date)
  const stops = items.filter(a => !isMove(a)).map(pointOf).filter((p): p is GeoPoint => !!p)
  const from = (prevDate && hotelFor(snap, prevDate)) || hotelFor(snap, date)
  const to = hotelFor(snap, date) || from
  const path = [from && pointOf(from), ...stops, to && pointOf(to)].filter((p): p is GeoPoint => !!p)

  let km = 0
  for (let i = 1; i < path.length; i++) {
    const leg = haversineKm(path[i - 1], path[i])
    if (leg <= MAX_LEG_KM) km += leg
  }

  // Los trenes cuentan (uno a las 8:11 es empezar a las 8:11), pero sin su hora
  // de llegada, y los vuelos no: un vuelo de las 2:25 no es "empezar a las 2:25".
  const timed = items.filter(a => a.type !== 'flight')
  const times = timed.flatMap(a => [hhmm(a.start_time), isMove(a) ? null : hhmm(a.end_time)])
    .filter((t): t is string => !!t)
  const starts = timed.map(a => hhmm(a.start_time)).filter((t): t is string => !!t)
  const start = starts.length ? starts.reduce((m, t) => (t < m ? t : m)) : null
  const end = times.length ? times.reduce((m, t) => (t > m ? t : m)) : null

  return {
    date, km,
    visits: items.filter(a => !isMove(a)).length,
    start, end,
    late: !!end && end >= LATE_END,
  }
}

export interface VersionMetrics {
  days: DayMetrics[]
  km: number
  visits: number
  lateDays: number
  /** Media de la primera hora de los días que tienen alguna, "HH:MM". */
  avgStart: string | null
}

export function versionMetrics(snap: SnapshotActivity[], dates: string[]): VersionMetrics {
  const days = dates.map((d, i) => dayMetrics(snap, d, i > 0 ? dates[i - 1] : null))
  const starts = days.map(d => d.start).filter((t): t is string => !!t).map(toMinutes)
  return {
    days,
    km: days.reduce((s, d) => s + d.km, 0),
    visits: days.reduce((s, d) => s + d.visits, 0),
    lateDays: days.filter(d => d.late).length,
    avgStart: starts.length ? fromMinutes(Math.round(starts.reduce((s, m) => s + m, 0) / starts.length)) : null,
  }
}

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
