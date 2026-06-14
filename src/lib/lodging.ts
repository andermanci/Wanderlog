import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Activity, ItineraryDay } from '@/types/database'

export type LodgingRole = 'in' | 'mid' | 'out' | 'single'
export interface Lodging {
  activity: Activity
  role: LodgingRole
  night: number
  nights: number
}

// Estancias (hoteles) mapeadas a CADA día que cubren (entrada → noches → salida).
// Reutilizado por el itinerario (banner por día) y el centro del día (Hoy).
export function lodgingByDayMap(
  activities: Activity[] | undefined,
  days: ItineraryDay[] | undefined,
): Map<string, Lodging[]> {
  const map = new Map<string, Lodging[]>()
  const dateById = new Map((days ?? []).map(d => [d.id, d.date]))
  ;(activities ?? []).filter(a => a.type === 'hotel').forEach(a => {
    const inDate = dateById.get(a.day_id)
    if (!inDate) return
    const outDate = (a.end_day_id && dateById.get(a.end_day_id)) || inDate
    const nights = Math.max(0, differenceInCalendarDays(parseISO(outDate), parseISO(inDate)))
    ;(days ?? []).forEach(d => {
      if (d.date < inDate || d.date > outDate) return
      const offset = differenceInCalendarDays(parseISO(d.date), parseISO(inDate))
      const role: LodgingRole = inDate === outDate ? 'single'
        : d.date === inDate ? 'in' : d.date === outDate ? 'out' : 'mid'
      map.set(d.id, [...(map.get(d.id) ?? []), { activity: a, role, night: offset + 1, nights }])
    })
  })
  return map
}

// Clave de orden de una actividad DENTRO de un día concreto.
// El hotel se muestra como banner en varios días, así que su posición se guarda
// por día en `day_orders` (mapa díaId → índice). El resto vive en un solo día y
// usa su `order_index`. Sin posición guardada, el hotel cae al final del día.
export function dayOrderOf(a: Activity, dayId: string): number {
  if (a.type === 'hotel') return a.day_orders?.[dayId] ?? Number.MAX_SAFE_INTEGER
  return a.order_index
}
