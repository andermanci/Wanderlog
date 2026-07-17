// Puente entre una RESERVA (tabla documents) y su ACTIVIDAD espejo del
// itinerario (tabla activities), enlazadas por documents.activity_id. Aquí viven
// solo funciones puras de mapeo de campos; las escrituras las hace
// useSyncReservation (lib/queries/reservationSync.ts). La importación de .ics
// (lib/queries/icsImport.ts) reutiliza timeOf/dateOf de aquí para no divergir.
import type { Activity, Document } from '@/types/database'
import { activityTypeFor, type BookingCategory } from '@/lib/ics/parseIcs'

const pad = (n: number) => String(n).padStart(2, '0')

/** Hora local (HH:MM) del instante ISO, o null en los eventos de día completo. */
export function timeOf(iso: string, allDay = false): string | null {
  if (allDay) return null
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Fecha (YYYY-MM-DD) del instante ISO. */
export const dateOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)

// Categorías de reserva que tiene sentido llevar al itinerario (las que tienen
// fecha/hora). `insurance` y la documentación personal quedan fuera.
export const ITINERARY_CATEGORIES: readonly string[] = [
  'flight', 'train', 'bus', 'hotel', 'car_rental', 'transfer', 'tour', 'ticket',
]

export function canShowInItinerary(category: string): boolean {
  return ITINERARY_CATEGORIES.includes(category)
}

// Tipo de actividad del itinerario para una categoría de documento (o null si no
// mapea, p. ej. insurance).
function activityTypeForDoc(category: string): Activity['type'] | null {
  if (category === 'other') return 'activity'
  if (canShowInItinerary(category)) return activityTypeFor(category as BookingCategory)
  return null
}

export type MirrorActivityFields = Pick<
  Activity,
  'day_id' | 'end_day_id' | 'type' | 'title' | 'origin' | 'destination' | 'start_time' | 'end_time'
>

// Campos de la actividad espejo derivados de una reserva. Devuelve null si la
// reserva no tiene fecha o cae fuera de los días del viaje (entonces se queda
// solo como documento).
export function docToActivityFields(
  doc: Pick<Document, 'category' | 'title' | 'origin' | 'destination' | 'datetime_start' | 'datetime_end'>,
  dayIdByDate: Map<string, string>,
): MirrorActivityFields | null {
  if (!doc.datetime_start) return null
  const dayId = dayIdByDate.get(dateOf(doc.datetime_start))
  if (!dayId) return null
  const type = activityTypeForDoc(doc.category) ?? 'activity'
  const endDayId = doc.datetime_end ? dayIdByDate.get(dateOf(doc.datetime_end)) ?? null : null
  return {
    day_id: dayId,
    end_day_id: endDayId && endDayId !== dayId ? endDayId : null,
    type,
    title: doc.title,
    origin: doc.origin,
    destination: doc.destination,
    start_time: timeOf(doc.datetime_start),
    end_time: doc.datetime_end ? timeOf(doc.datetime_end) : null,
  }
}

// Tipo de actividad → categoría de documento (para el flujo inverso: crear el
// documento desde una actividad). Solo el vuelo se usa hoy; el resto es un
// mapeo razonable por si se amplía.
const ACTIVITY_TYPE_TO_DOC_CATEGORY: Record<Activity['type'], Document['category']> = {
  flight: 'flight', hotel: 'hotel', transport: 'transfer',
  restaurant: 'other', activity: 'ticket', place: 'ticket', other: 'other',
}

const combine = (date: string, time: string | null) => `${date}T${time ?? '00:00'}`

export interface ReservationExtras {
  locator?: string | null
  provider?: string | null
  confirmation_number?: string | null
  seat?: string | null
  flight_number?: string | null
  link?: string | null
  file_url?: string | null
  back_url?: string | null
}

export type MirrorDocFields = Pick<
  Document,
  'category' | 'title' | 'origin' | 'destination' | 'datetime_start' | 'datetime_end'
  | 'locator' | 'provider' | 'confirmation_number' | 'seat' | 'flight_number' | 'link' | 'file_url' | 'back_url'
>

// Campos del documento derivados de una actividad + los datos de reserva que se
// capturan en el formulario de la actividad.
export function activityToDocFields(
  activity: Pick<Activity, 'type' | 'title' | 'origin' | 'destination' | 'day_id' | 'end_day_id' | 'start_time' | 'end_time'>,
  dayDateById: Map<string, string>,
  extra: ReservationExtras,
): MirrorDocFields {
  const startDate = dayDateById.get(activity.day_id) ?? null
  const endDate = activity.end_day_id ? dayDateById.get(activity.end_day_id) ?? null : null
  return {
    category: ACTIVITY_TYPE_TO_DOC_CATEGORY[activity.type],
    title: activity.title,
    origin: activity.origin,
    destination: activity.destination,
    datetime_start: startDate ? combine(startDate, activity.start_time) : null,
    datetime_end: activity.end_time && (endDate ?? startDate)
      ? combine((endDate ?? startDate)!, activity.end_time)
      : null,
    locator: extra.locator || null,
    provider: extra.provider || null,
    confirmation_number: extra.confirmation_number || null,
    seat: extra.seat || null,
    flight_number: extra.flight_number || null,
    link: extra.link || null,
    file_url: extra.file_url ?? null,
    back_url: extra.back_url ?? null,
  }
}
