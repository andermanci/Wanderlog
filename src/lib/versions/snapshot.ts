import type { Activity, ItineraryDay, SnapshotActivity } from '@/types/database'

// Una versión del itinerario es una lista de SnapshotActivity: las actividades
// con la FECHA de su día en vez del id (ver 061_itinerary_versions.sql). El
// itinerario actual se convierte a la misma forma para compararlo como una
// versión más.

export function toLiveSnapshot(activities: Activity[], days: ItineraryDay[]): SnapshotActivity[] {
  const dateOf = new Map(days.map(d => [d.id, d.date]))
  return activities
    .filter(a => dateOf.has(a.day_id))
    .map(a => {
      const { day_id, end_day_id, ...withTrip } = a
      const rest: Omit<typeof withTrip, 'trip_id'> & { trip_id?: string } = { ...withTrip }
      delete rest.trip_id
      const dayOrders: Record<string, number> = {}
      for (const [k, v] of Object.entries(a.day_orders ?? {})) {
        const d = dateOf.get(k)
        if (d) dayOrders[d] = v
      }
      return {
        ...rest,
        date: dateOf.get(day_id)!,
        end_date: end_day_id ? dateOf.get(end_day_id) ?? null : null,
        day_orders: dayOrders,
      }
    })
}

/** Posición de una actividad dentro de una fecha (como dayOrderOf, pero por fecha). */
export function orderOn(a: SnapshotActivity, date: string): number {
  if (a.type === 'hotel') return a.day_orders?.[date] ?? Number.MAX_SAFE_INTEGER
  return a.order_index
}

/** Actividades de una fecha, en orden. Los hoteles van aparte (ver hotelFor). */
export function itemsOn(snap: SnapshotActivity[], date: string): SnapshotActivity[] {
  return snap
    .filter(a => a.type !== 'hotel' && a.date === date)
    .sort((x, y) => orderOn(x, date) - orderOn(y, date))
}

/** Hotel en el que se duerme la noche de `date` (entra ese día o antes y sale después). */
export function hotelFor(snap: SnapshotActivity[], date: string): SnapshotActivity | null {
  return snap.find(a => a.type === 'hotel' && a.date <= date && (a.end_date ?? a.date) > date) ?? null
}

/** Hora "HH:MM" de un campo time de Postgres ("08:30:00"), o null. */
export function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null
}
