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

// Versión sin decimales, para los ejes de las gráficas (donde no cabe "1.234,00 €").
export function formatCurrencyShort(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount)
}

// Símbolo de la divisa (€, ¥, $…), para etiquetas cortas como "Precio (¥)".
export function currencySymbol(currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 })
    .formatToParts(0)
    .find(p => p.type === 'currency')?.value ?? currency
}

// Suma importes agrupados por divisa (no se pueden sumar EUR + JPY a pelo).
export function sumByCurrency(items: Array<{ amount: number; currency: string }>): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, it) => {
    acc[it.currency] = (acc[it.currency] ?? 0) + it.amount
    return acc
  }, {})
}

// Estado real del viaje derivado de las fechas: "en curso" y "completado" se
// calculan solos; "planificando/confirmado" se respetan mientras no empiece.
export function effectiveStatus(trip: { start_date: string; end_date: string; status: string }): string {
  const today = format(new Date(), 'yyyy-MM-dd')
  if (trip.end_date < today) return 'completed'
  if (trip.start_date <= today && today <= trip.end_date) return 'in_progress'
  return trip.status === 'completed' ? 'completed' : trip.status
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
  hotel: '#f59e0b',
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
  passport: 'Pasaporte',
  dni: 'DNI',
  visa: 'Visado',
  driving_license: 'Carnet de conducir',
  health_card: 'Tarjeta sanitaria',
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

// Documentación personal (identidad), separada de las reservas del viaje.
export const PERSONAL_DOC_CATEGORIES = ['passport', 'dni', 'visa', 'driving_license', 'health_card']

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
  hotel: '#f59e0b',
  attraction: '#22c55e',
  cafe: '#8b5cf6',
  bar: '#ec4899',
  shop: '#06b6d4',
  other: '#6b7280',
}

// Icono por tipo de lugar (compartido por el mapa y la lista de lugares).
export const PLACE_CATEGORY_ICONS: Record<string, string> = {
  restaurant: '🍽️',
  hotel: '🏨',
  attraction: '🎯',
  cafe: '☕',
  bar: '🍺',
  shop: '🛍️',
  other: '📍',
}

export const EXPENSE_CATEGORIES = [
  'Alojamiento', 'Transporte', 'Comida', 'Actividades',
  'Compras', 'Seguros', 'Visados', 'Otros',
]

// Divisas «comunes»: se muestran primero en los selectores y sirven de respaldo
// si la API de tipos de cambio no está disponible (offline).
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'MXN', 'ARS', 'COP', 'BRL', 'CAD', 'AUD']

// Nombre localizado de una divisa por su código ISO (p. ej. 'JPY' → 'yen japonés').
let _currencyNames: Intl.DisplayNames | null = null
export function currencyName(code: string): string {
  try {
    _currencyNames ??= new Intl.DisplayNames(['es'], { type: 'currency' })
    return _currencyNames.of(code) ?? code
  } catch {
    return code
  }
}

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
  completed: '#bf4d22',
}
