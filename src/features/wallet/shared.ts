// Piezas comunes de la cartera: tonos, rótulos, fechas y la lista mezclada de
// billetes (reservas + adjuntos de actividades).
import { addDays, addMonths, format, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Tone } from '@/design'
import { DOCUMENT_LABELS, PERSONAL_DOC_CATEGORIES, formatDate } from '@/lib/utils'
import { ACTIVITY_TO_CATEGORY, isPdfValue } from '@/lib/wallet/pass'
import type { Activity, ActivityAttachment, Document, ItineraryDay } from '@/types/database'

export type DocCategory = Document['category']

/** Rótulos de grupo: los de documento más «Restaurante», que solo sale de adjuntos. */
export const GROUP_LABELS: Record<string, string> = { ...DOCUMENT_LABELS, restaurant: 'Restaurante' }

/** Orden al agrupar por tipo: cómo llegas, dónde duermes, qué haces. */
const TYPE_ORDER = ['flight', 'train', 'bus', 'transfer', 'car_rental', 'hotel', 'restaurant', 'tour', 'ticket', 'other']

/** Categorías que se pueden elegir en el formulario de reservas (todas menos las personales). */
export const BOOKING_CATEGORIES = Object.entries(DOCUMENT_LABELS)
  .filter(([k]) => !PERSONAL_DOC_CATEGORIES.includes(k)) as [DocCategory, string][]

const TONES: Record<string, Tone> = {
  flight: 'flight',
  train: 'transport', bus: 'transport', transfer: 'transport', car_rental: 'transport',
  hotel: 'hotel',
  restaurant: 'restaurant',
  tour: 'activity', ticket: 'activity',
  insurance: 'info',
  other: 'other',
}

/** Tono (color) de una categoría de documento. */
export const toneOf = (category: string): Tone => TONES[category] ?? 'primary'

export const isPersonal = (d: Document) => PERSONAL_DOC_CATEGORIES.includes(d.category)
export const isIdentity = (d: Document) => d.category === 'dni' || d.category === 'passport'

/** ¿Se puede pintar en un `<img>`? Se mira el valor guardado, que conserva la extensión. */
export function isImageRef(value: string | null | undefined, mime?: string | null): boolean {
  if (!value) return false
  if (mime) return mime.startsWith('image/')
  return /\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(value)
}
export const isPdfRef = (value: string | null | undefined, mime?: string | null) => !!value && isPdfValue(value, mime)

// ---- Caducidad (datetime_end en la documentación personal) ----

export type Expiry = 'expired' | 'soon' | null

export function expiryState(end: string | null, now: Date): Expiry {
  if (!end) return null
  const d = parseISO(end)
  if (!isValid(d)) return null
  if (d < now) return 'expired'
  if (d < addMonths(now, 6)) return 'soon'
  return null
}

// ---- Fechas ----

const localFormat = (iso: string | null, fmt: string): string | null => {
  if (!iso) return null
  const d = parseISO(iso)
  return isValid(d) ? format(d, fmt) : null
}
const localDay = (iso: string | null) => localFormat(iso, 'yyyy-MM-dd')

export const todayKey = (now: Date) => format(now, 'yyyy-MM-dd')

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «mar 17 nov · 10:30», con el final si lo hay. */
export function whenLabel(start: string | null, end: string | null): string | null {
  if (!start) return null
  const a = formatDate(start, 'EEE d MMM · HH:mm')
  if (a === '—') return null
  if (!end) return a
  const sameDay = localDay(start) === localDay(end)
  const b = formatDate(end, sameDay ? 'HH:mm' : 'EEE d MMM · HH:mm')
  return b === '—' ? a : `${a} – ${b}`
}

// ---- Billetes: reservas y adjuntos de actividades en una sola lista ----

interface TicketBase {
  /** Clave única en la lista. */
  key: string
  /** Categoría con la que se pinta y se agrupa por tipo. */
  category: string
  /** Día (YYYY-MM-DD) en el que hace falta, o null si no se sabe. */
  day: string | null
  /** Último día en que sigue sirviendo (una estancia de hotel). */
  lastDay: string | null
  /** Para ordenar dentro del grupo. */
  sort: string
}
export type TicketItem =
  | (TicketBase & { kind: 'doc'; doc: Document })
  | (TicketBase & { kind: 'attachment'; att: ActivityAttachment; activity?: Activity })

export function buildTickets(
  docs: Document[],
  attachments: ActivityAttachment[],
  activities: Activity[],
  days: ItineraryDay[],
): TicketItem[] {
  const activityById = new Map(activities.map(a => [a.id, a]))
  const dateByDay = new Map(days.map(d => [d.id, d.date]))
  const fromDocs = docs.map((doc): TicketItem => {
    const day = localDay(doc.datetime_start)
    return {
      kind: 'doc', key: `doc-${doc.id}`, doc, category: doc.category,
      day, lastDay: localDay(doc.datetime_end) ?? day,
      sort: localFormat(doc.datetime_start, "yyyy-MM-dd'T'HH:mm") ?? '',
    }
  })
  const fromAttachments = attachments.map((att): TicketItem => {
    const activity = activityById.get(att.activity_id)
    const day = activity ? dateByDay.get(activity.day_id) ?? null : null
    const lastDay = activity?.end_day_id ? dateByDay.get(activity.end_day_id) ?? day : day
    return {
      kind: 'attachment', key: `att-${att.id}`, att, activity,
      category: ACTIVITY_TO_CATEGORY[activity?.type ?? 'other'] ?? 'other',
      day, lastDay,
      sort: day ? `${day}T${activity?.start_time?.slice(0, 5) ?? '00:00'}` : '',
    }
  })
  return [...fromDocs, ...fromAttachments]
}

export interface TicketGroup {
  key: string
  label: string
  /** Categoría para el icono del rótulo (solo al agrupar por tipo). */
  category?: string
  items: TicketItem[]
}

const bySort = (a: TicketItem, b: TicketItem) => (a.sort || '￿').localeCompare(b.sort || '￿')

/** Hoy primero, luego los días que vienen, después lo que no tiene fecha y al final lo ya pasado. */
export function groupByDate(items: TicketItem[], now: Date): TicketGroup[] {
  const today = todayKey(now)
  const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
  const current: TicketItem[] = []
  const undated: TicketItem[] = []
  const past: TicketItem[] = []
  const future = new Map<string, TicketItem[]>()
  for (const item of items) {
    if (!item.day) undated.push(item)
    else if ((item.lastDay ?? item.day) < today) past.push(item)
    else if (item.day <= today) current.push(item)
    else future.set(item.day, [...(future.get(item.day) ?? []), item])
  }
  const groups: TicketGroup[] = []
  if (current.length) groups.push({ key: 'hoy', label: 'Hoy', items: current.sort(bySort) })
  for (const day of [...future.keys()].sort()) {
    const nice = capital(format(parseISO(day), "EEEE d 'de' MMMM", { locale: es }))
    groups.push({ key: day, label: day === tomorrow ? `Mañana · ${nice}` : nice, items: future.get(day)!.sort(bySort) })
  }
  if (undated.length) groups.push({ key: 'sin-fecha', label: 'Sin fecha', items: undated })
  if (past.length) groups.push({ key: 'pasados', label: 'Ya pasados', items: past.sort(bySort).reverse() })
  return groups
}

export function groupByType(items: TicketItem[]): TicketGroup[] {
  const map = new Map<string, TicketItem[]>()
  for (const item of items) map.set(item.category, [...(map.get(item.category) ?? []), item])
  const keys = [...TYPE_ORDER.filter(c => map.has(c)), ...[...map.keys()].filter(c => !TYPE_ORDER.includes(c))]
  return keys.map(c => ({ key: c, label: GROUP_LABELS[c] ?? 'Otro', category: c, items: map.get(c)!.sort(bySort) }))
}

/** Lo que se ve y se abre desde los visores. */
export interface FileRef {
  /** Path del bucket privado `documents` o URL pública de un adjunto. */
  url: string
  name: string
  mime?: string | null
}
export interface IdCardRef {
  title: string
  subtitle: string | null
  front: string | null
  back: string | null
}
