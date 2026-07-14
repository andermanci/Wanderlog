import type { Activity, ItineraryDay } from '@/types/database'
import { isMove } from '@/lib/travelTime'
import type { Zone } from '@/lib/timezone'

// Huso de cada DÍA del itinerario: la ciudad donde estás. Solo los movimientos
// (vuelos y transportes) llevan huso propio en la BD; el resto de actividades
// heredan el del día. Así se rellenan ~14 filas por viaje en vez de cientos.
//
// Regla en cascada, en este orden:
//   1. El destino del último movimiento que ATERRIZA ese día  → "aquí has llegado"
//   2. El origen del primer movimiento que SALE ese día        → "de aquí sales"
//   3. El huso del día anterior                                → "sigues donde estabas"
//
// Con un Madrid→Tokio que sale el día 1 y aterriza el día 2:
//   día 1 → no aterriza nada, sale el vuelo → origin_tz = Europe/Madrid ✓
//   día 2 → aterriza el vuelo               → destination_tz = Asia/Tokyo ✓
//   día 3+ → sin movimientos                → arrastra Asia/Tokyo ✓

export interface DayZones {
  /** Huso por defecto de cada día (dayId → IANA). */
  tzByDay: Map<string, Zone>
  /**
   * Días que empiezan en un huso y acaban en otro SIN cruzar medianoche (mañana
   * en Madrid, vuelo por la tarde que aterriza en Lisboa el mismo día).
   *
   * En estos días no se puede saber en qué huso está escrita cada actividad sin
   * mirar su propia coordenada, así que sus actividades se quedan SIN huso y el
   * motor de conflictos calla en cualquier comparación cruzada. Son como mucho
   * un par de días por viaje, y callar es mejor que mentir.
   */
  multiZoneDayIds: Set<string>
}

export function computeDayZones(days: ItineraryDay[], activities: Activity[]): DayZones {
  const byDay = new Map<string, Activity[]>()
  for (const a of activities) {
    byDay.set(a.day_id, [...(byDay.get(a.day_id) ?? []), a])
  }

  const tzByDay = new Map<string, Zone>()
  const multiZoneDayIds = new Set<string>()
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date))

  let previous: Zone = null

  for (const day of ordered) {
    const items = (byDay.get(day.id) ?? []).sort((a, b) => a.order_index - b.order_index)
    const moves = items.filter(isMove)

    // Aterriza aquí: o bien el movimiento acaba este día (end_day_id), o bien
    // empieza y acaba el mismo día.
    const landing = activities
      .filter(a => isMove(a) && (a.end_day_id ?? a.day_id) === day.id)
      .sort((a, b) => a.order_index - b.order_index)
      .at(-1)

    const arrived = landing?.destination_tz ?? null
    const departs = moves.find(m => m.day_id === day.id)?.origin_tz ?? null

    // El día ya guardado en la BD manda (lo escribió el backfill), y si no, se
    // deduce.
    const zone: Zone = day.tz ?? arrived ?? departs ?? previous

    // Multi-huso: sales de un sitio y aterrizas en otro el MISMO día.
    const sameDayMove = moves.find(m =>
      (m.end_day_id ?? m.day_id) === m.day_id &&
      m.origin_tz && m.destination_tz && m.origin_tz !== m.destination_tz,
    )
    // O bien: llegas de un huso y te vas a otro distinto el mismo día.
    const crossesWithinDay = !!arrived && !!departs && arrived !== departs

    if (sameDayMove || crossesWithinDay) multiZoneDayIds.add(day.id)

    tzByDay.set(day.id, zone)
    if (zone) previous = zone
  }

  return { tzByDay, multiZoneDayIds }
}

/**
 * Huso en el que está escrita una hora concreta de una actividad.
 * Los movimientos lo llevan en sus propias columnas; el resto hereda el del día.
 */
export function zoneOf(
  a: Activity,
  end: 'start' | 'end',
  zones: DayZones,
): Zone {
  if (isMove(a)) {
    return (end === 'start' ? a.origin_tz : a.destination_tz) ?? null
  }
  // En un día multi-huso no sabemos en cuál de los dos cae esta actividad.
  if (zones.multiZoneDayIds.has(a.day_id)) return null
  return zones.tzByDay.get(a.day_id) ?? null
}
