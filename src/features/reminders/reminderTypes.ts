import { isPast, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, CalendarClock, FileClock, Plane, TicketCheck, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/design'
import type { Reminder, Trip, Document as TravelDocument } from '@/types/database'

export type ReminderType = Reminder['type']

export const REMINDER_TYPES: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  custom: { label: 'Personalizado', icon: Bell, tone: 'primary' },
  trip_countdown: { label: 'Cuenta atrás del viaje', icon: CalendarClock, tone: 'activity' },
  flight: { label: 'Vuelo', icon: Plane, tone: 'flight' },
  checkin: { label: 'Check-in', icon: TicketCheck, tone: 'transport' },
  document_expiry: { label: 'Caducidad de un documento', icon: FileClock, tone: 'warning' },
}

export const reminderLook = (type: string) => REMINDER_TYPES[type] ?? REMINDER_TYPES.custom

export const formatWhen = (iso: string) => format(parseISO(iso), "d 'de' MMMM 'a las' HH:mm", { locale: es })

export interface ReminderSuggestion {
  title: string
  remind_at: string
  type: ReminderType
}

/**
 * Avisos que se proponen solos: la víspera del viaje a las 9:00 y el check-in
 * de cada vuelo 24 h antes. No propone los que ya pasaron ni los que ya existen.
 */
export function suggestReminders(
  trip: Trip | null | undefined,
  documents: TravelDocument[],
  reminders: Reminder[],
): ReminderSuggestion[] {
  const existing = new Set(reminders.map(r => r.title.toLowerCase()))
  const out: ReminderSuggestion[] = []
  if (trip) {
    const eve = parseISO(trip.start_date)
    eve.setDate(eve.getDate() - 1)
    eve.setHours(9, 0, 0, 0)
    const title = `Tu viaje a ${trip.destination} empieza mañana`
    if (!isPast(eve) && !existing.has(title.toLowerCase())) {
      out.push({ title, remind_at: eve.toISOString(), type: 'trip_countdown' })
    }
  }
  for (const doc of documents) {
    if (doc.category !== 'flight' || !doc.datetime_start) continue
    const checkin = new Date(parseISO(doc.datetime_start).getTime() - 24 * 60 * 60 * 1000)
    const title = `Check-in: ${doc.title}`
    if (!isPast(checkin) && !existing.has(title.toLowerCase())) {
      out.push({ title, remind_at: checkin.toISOString(), type: 'checkin' })
    }
  }
  return out
}
