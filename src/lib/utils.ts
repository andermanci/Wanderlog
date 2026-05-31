import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt = 'dd MMM yyyy') {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(d)) return '—'
  return format(d, fmt, { locale: es })
}

export function daysUntil(date: string): number {
  return differenceInDays(parseISO(date), new Date())
}

export function countdownLabel(date: string): string {
  const days = daysUntil(date)
  if (days < 0) return 'Finalizado'
  if (days === 0) return '¡Hoy!'
  if (days === 1) return 'Mañana'
  return `En ${days} días`
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount)
}

export function generateICS(events: ICSEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wanderlog//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@wanderlog`,
      `SUMMARY:${event.title}`,
      `DTSTART:${event.start}`,
      `DTEND:${event.end}`,
      event.description ? `DESCRIPTION:${event.description}` : '',
      event.location ? `LOCATION:${event.location}` : '',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}

export interface ICSEvent {
  uid: string
  title: string
  start: string
  end: string
  description?: string
  location?: string
}

export const ACTIVITY_COLORS: Record<string, string> = {
  flight: '#6366f1',
  hotel: '#c9a84c',
  restaurant: '#f97316',
  activity: '#22c55e',
  transport: '#06b6d4',
  place: '#a855f7',
  other: '#6b7280',
}

export const ACTIVITY_LABELS: Record<string, string> = {
  flight: 'Vuelo',
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  activity: 'Actividad',
  transport: 'Transporte',
  place: 'Lugar',
  other: 'Otro',
}

export const DOCUMENT_LABELS: Record<string, string> = {
  flight: 'Vuelo',
  train: 'Tren',
  bus: 'Bus',
  hotel: 'Hotel',
  car_rental: 'Alquiler coche',
  transfer: 'Transfer',
  tour: 'Tour',
  ticket: 'Entrada',
  insurance: 'Seguro',
  other: 'Otro',
}

export const PLACE_CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  hotel: 'Hotel',
  attraction: 'Atracción',
  cafe: 'Café',
  bar: 'Bar',
  shop: 'Tienda',
  other: 'Otro',
}

export const PLACE_CATEGORY_COLORS: Record<string, string> = {
  restaurant: '#f97316',
  hotel: '#c9a84c',
  attraction: '#22c55e',
  cafe: '#8b5cf6',
  bar: '#ec4899',
  shop: '#06b6d4',
  other: '#6b7280',
}

export const EXPENSE_CATEGORIES = [
  'Alojamiento', 'Transporte', 'Comida', 'Actividades',
  'Compras', 'Seguros', 'Visados', 'Otros',
]

export const STATUS_LABELS: Record<string, string> = {
  planning: 'Planificando',
  confirmed: 'Confirmado',
  in_progress: 'En curso',
  completed: 'Completado',
}

export const STATUS_COLORS: Record<string, string> = {
  planning: '#6b7280',
  confirmed: '#3b82f6',
  in_progress: '#22c55e',
  completed: '#c9a84c',
}
