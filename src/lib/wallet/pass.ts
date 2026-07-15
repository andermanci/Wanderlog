import type { Document, ActivityAttachment, Activity } from '@/types/database'
import type { WalletAttachment } from '@/components/wallet/WalletCode'
import { PERSONAL_DOC_CATEGORIES } from '@/lib/utils'

// Un "pase" es la forma normalizada que consume el modal estilo cartera: sale de
// una reserva (tabla documents) o de un adjunto del itinerario (activity_attachments).
export interface WalletPass {
  id: string
  category: string
  title: string
  code: string | null
  codeLabel: string | null
  link: string | null
  start: string | null
  end: string | null
  origin: string | null
  destination: string | null
  seat: string | null
  attachment: WalletAttachment | null
}

// Los adjuntos del itinerario heredan un tipo de reserva del tipo de actividad,
// para el icono y el color.
export const ACTIVITY_TO_CATEGORY: Record<string, string> = {
  flight: 'flight', hotel: 'hotel', transport: 'transfer',
  restaurant: 'restaurant', activity: 'ticket', place: 'ticket', other: 'other',
}

export function isPdfValue(value: string, mime?: string | null): boolean {
  if (mime) return mime === 'application/pdf'
  return /\.pdf(\?|$)/i.test(value)
}

// ¿Esta reserva tiene algo que enseñar como código? Billete adjunto o
// localizador/confirmación/enlace del que generar un QR de referencia.
export function canShowPass(doc: Document): boolean {
  if (PERSONAL_DOC_CATEGORIES.includes(doc.category) || doc.category === 'insurance') return false
  return !!(doc.file_url || doc.locator || doc.confirmation_number || doc.link)
}

export function buildDocPass(doc: Document): WalletPass | null {
  if (!canShowPass(doc)) return null
  const code = doc.locator || doc.confirmation_number || null
  const codeLabel = doc.locator ? 'Localizador' : doc.confirmation_number ? 'Confirmación' : null
  const title = doc.provider || doc.title
  return {
    id: `doc-${doc.id}`,
    category: doc.category,
    title,
    code,
    codeLabel,
    link: doc.link,
    start: doc.datetime_start,
    end: doc.datetime_end,
    origin: doc.origin,
    destination: doc.destination,
    seat: doc.seat,
    attachment: doc.file_url ? { value: doc.file_url, isPdf: isPdfValue(doc.file_url), name: title } : null,
  }
}

export function buildAttachmentPass(att: ActivityAttachment, activity?: Activity): WalletPass {
  const category = ACTIVITY_TO_CATEGORY[activity?.type ?? 'other'] ?? 'other'
  const title = activity?.title || att.name
  return {
    id: `att-${att.id}`,
    category,
    title,
    code: null,
    codeLabel: null,
    link: null,
    // activities.start_time es solo la hora (sin fecha), así que no vale como fecha del pase.
    start: null,
    end: null,
    origin: activity?.origin ?? null,
    destination: activity?.destination ?? null,
    seat: null,
    attachment: { value: att.file_url, isPdf: isPdfValue(att.file_url, att.mime), name: att.name },
  }
}
