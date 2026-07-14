import type { Activity, ItineraryDay } from '@/types/database'
import { pairKey, type TravelLeg } from '@/lib/travelTime'
import { wallToUtcMs, comparableZones, type Zone } from '@/lib/timezone'
import { zoneOf, type DayZones } from '@/lib/dayTz'

// Detección de conflictos en el itinerario. La app ya calcula el tiempo de
// trayecto real entre paradas y ya guarda las horas de cada actividad — esto es
// lo que faltaba: cruzarlos.
//
// PURO: sin red, sin React, sin `new Date()` (la fecha de hoy entra como
// parámetro, o los tests dependerían del reloj).
//
// No se persiste nada. Nada de tabla, RLS ni sincronización: se recalcula solo
// al reordenar y nunca se queda obsoleto.

export type ConflictKind = 'overlap' | 'unreachable' | 'tight' | 'bad-times'
export type ConflictSeverity = 'error' | 'warning'

export interface Conflict {
  kind: ConflictKind
  severity: ConflictSeverity
  dayId: string
  activityIds: string[]
  /** Tramos implicados, para pintar el conector en rojo/ámbar. */
  pairKeys: string[]
  message: string
}

/** Por debajo de este margen de llegada, "vas justo". */
export const TIGHT_MINUTES = 15
/** Una duración mayor que esto huele a día de llegada mal puesto. */
const MAX_SANE_HOURS = 36

interface Endpoint { date: string; time: string; zone: Zone }

interface Slot {
  id: string
  title: string
  start: Endpoint | null
  end: Endpoint | null
  /** Los hoteles no son sujetos: son un banner de estancia, no una cita. */
  subject: boolean
}

const instant = (e: Endpoint) => wallToUtcMs(e.date, e.time, e.zone)

function toSlot(a: Activity, zones: DayZones, dateByDayId: Map<string, string>): Slot | null {
  const startDate = dateByDayId.get(a.day_id)
  if (!startDate) return null
  const endDate = dateByDayId.get(a.end_day_id ?? a.day_id) ?? startDate

  return {
    id: a.id,
    title: a.title,
    start: a.start_time ? { date: startDate, time: a.start_time, zone: zoneOf(a, 'start', zones) } : null,
    end: a.end_time ? { date: endDate, time: a.end_time, zone: zoneOf(a, 'end', zones) } : null,
    // Un hotel de 3 noches se repite como banner cada día: si fuera sujeto,
    // solaparía con absolutamente todo, todos los días.
    subject: a.type !== 'hotel',
  }
}

const minutes = (ms: number) => Math.round(ms / 60_000)
const quote = (s: string) => `«${s}»`

export interface DayConflictInput {
  day: ItineraryDay
  /** Items ordenados del día (= combinedItemsFor), hoteles incluidos. */
  items: Activity[]
  /** Movimientos que ATERRIZAN este día: son lo primero que pasa. */
  arrivals: Activity[]
  dateByDayId: Map<string, string>
  zones: DayZones
  /** Tramos ya resueltos. Vacío (día colapsado, sin red) ⇒ solo se buscan solapes. */
  legs: Map<string, TravelLeg>
}

export function detectDayConflicts(input: DayConflictInput): Conflict[] {
  const { day, items, arrivals, dateByDayId, zones, legs } = input
  const ordered = [...arrivals, ...items]
  const slots = ordered
    .map(a => toSlot(a, zones, dateByDayId))
    .filter((s): s is Slot => s !== null)

  const conflicts: Conflict[] = []

  // 1) Horas imposibles. Es la red de seguridad de los husos horarios: si el
  //    usuario olvidó el día de llegada de un vuelo nocturno, sale aquí.
  for (const s of slots) {
    if (!s.subject || !s.start || !s.end) continue
    if (!comparableZones(s.start.zone, s.end.zone)) continue
    const mins = minutes(instant(s.end) - instant(s.start))
    if (mins < 0) {
      conflicts.push({
        kind: 'bad-times', severity: 'error', dayId: day.id,
        activityIds: [s.id], pairKeys: [],
        message: `${quote(s.title)}: la llegada es anterior a la salida. ¿Falta indicar el día de llegada?`,
      })
    } else if (mins > MAX_SANE_HOURS * 60) {
      conflicts.push({
        kind: 'bad-times', severity: 'warning', dayId: day.id,
        activityIds: [s.id], pairKeys: [],
        message: `${quote(s.title)} dura más de ${MAX_SANE_HOURS} h. Revisa las horas o el día de llegada.`,
      })
    }
  }

  // 2) Solapes: dos citas que se pisan.
  const timed = slots.filter(s => s.subject && s.start)
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]
      // Un instante sin extensión no puede solapar con nada, salvo que empiecen
      // exactamente a la vez ("dos cosas a la misma hora").
      if (!a.end && !b.end) {
        if (!comparableZones(a.start!.zone, b.start!.zone)) continue
        if (instant(a.start!) === instant(b.start!)) {
          conflicts.push({
            kind: 'overlap', severity: 'error', dayId: day.id,
            activityIds: [a.id, b.id], pairKeys: [],
            message: `${quote(a.title)} y ${quote(b.title)} están a la misma hora.`,
          })
        }
        continue
      }
      if (!comparableZones(a.start!.zone, b.start!.zone)) continue

      const aStart = instant(a.start!)
      const aEnd = a.end && comparableZones(a.start!.zone, a.end.zone) ? instant(a.end) : aStart
      const bStart = instant(b.start!)
      const bEnd = b.end && comparableZones(b.start!.zone, b.end.zone) ? instant(b.end) : bStart

      // Tocarse los extremos (una acaba a las 12:00 y la otra empieza a las
      // 12:00) NO es solape. Ya lo pillará "no llegas" si hay trayecto.
      const overlapMs = Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
      if (overlapMs > 0) {
        conflicts.push({
          kind: 'overlap', severity: 'error', dayId: day.id,
          activityIds: [a.id, b.id], pairKeys: [],
          message: `${quote(a.title)} y ${quote(b.title)} se solapan ${minutes(overlapMs)} min.`,
        })
      }
    }
  }

  // 3) "No llegas" / "vas justo".
  //
  // Se comparan items CON HORA consecutivos, sumando los tramos de todos los
  // saltos intermedios: los items sin hora son nodos de paso (aportan trayecto,
  // no imponen restricción). Comparar solo pares consecutivos se tragaría el
  // conflicto real de [Museo 10-12] → [Souvenirs, sin hora] → [Comida 12:15].
  let from: Slot | null = null
  let travelSeconds = 0
  let chain: string[] = []
  let broken = false

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]

    if (from && s.subject && s.start) {
      // Punto de salida de A: su hora de fin, o la de inicio si no tiene fin.
      // Sin hora de fin, el resultado es una COTA INFERIOR (ni saliendo al
      // instante llegas), así que solo se avisa si se incumple: es certeza.
      const isLowerBound = !from.end
      const departure = from.end ?? from.start!

      if (!broken && comparableZones(departure.zone, s.start.zone)) {
        const gapMin = minutes(instant(s.start) - instant(departure))
        const travelMin = Math.round(travelSeconds / 60)
        const slack = gapMin - travelMin

        if (travelMin > 0 && slack < 0) {
          conflicts.push({
            kind: 'unreachable', severity: 'error', dayId: day.id,
            activityIds: [from.id, s.id], pairKeys: [...chain],
            message: `No llegas: de ${quote(from.title)} a ${quote(s.title)} hay ${travelMin} min de trayecto y solo tienes ${Math.max(0, gapMin)}.`,
          })
        } else if (travelMin > 0 && slack < TIGHT_MINUTES && !isLowerBound) {
          conflicts.push({
            kind: 'tight', severity: 'warning', dayId: day.id,
            activityIds: [from.id, s.id], pairKeys: [...chain],
            message: `Vas justo: llegarías a ${quote(s.title)} con ${slack} min de margen.`,
          })
        }
      }
    }

    if (s.subject && s.start) {
      from = s
      travelSeconds = 0
      chain = []
      broken = false
    }

    // Acumula el trayecto hacia el siguiente item del día.
    const next = slots[i + 1]
    if (next && from) {
      const key = pairKey(s.id, next.id)
      const leg = legs.get(key)
      if (leg) {
        travelSeconds += leg.durationSeconds
        chain.push(key)
      } else {
        // Sin tramo no se puede saber cuánto se tarda. Se rompe la cadena y se
        // calla: nunca subestimar un trayecto.
        broken = true
      }
    }
  }

  return conflicts
}

export interface TripConflictInput {
  days: ItineraryDay[]
  itemsFor: (dayId: string) => Activity[]
  arrivalsFor: (dayId: string) => Activity[]
  dateByDayId: Map<string, string>
  zones: DayZones
  legs: Map<string, TravelLeg>
  /** yyyy-MM-dd. Los días pasados no se evalúan. */
  today: string
}

export interface TripConflicts {
  byDay: Map<string, Conflict[]>
  /** pairKey → severidad, para colorear el conector en O(1). */
  legSeverity: Map<string, ConflictSeverity>
}

export function detectTripConflicts(input: TripConflictInput): TripConflicts {
  const byDay = new Map<string, Conflict[]>()
  const legSeverity = new Map<string, ConflictSeverity>()

  for (const day of input.days) {
    // Un viaje ya vivido no puede convertirse en un muro rojo.
    if (day.date < input.today) continue

    const conflicts = detectDayConflicts({
      day,
      items: input.itemsFor(day.id),
      arrivals: input.arrivalsFor(day.id),
      dateByDayId: input.dateByDayId,
      zones: input.zones,
      legs: input.legs,
    })
    if (conflicts.length === 0) continue

    byDay.set(day.id, conflicts)
    for (const c of conflicts) {
      for (const key of c.pairKeys) {
        // El error manda sobre el aviso si un tramo cae en los dos.
        if (c.severity === 'error' || !legSeverity.has(key)) legSeverity.set(key, c.severity)
      }
    }
  }

  return { byDay, legSeverity }
}
