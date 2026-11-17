import {
  BedDouble, Bus, Utensils, Ticket, ShoppingBag, ShieldCheck, Stamp, Receipt, type LucideIcon,
} from 'lucide-react'
import type { Tone } from '@/design'

// Icono y tono de cada categoría de gasto. Siempre los mismos en lista y gráficos.
const CATEGORY_LOOK: Record<string, { icon: LucideIcon; tone: Tone }> = {
  Alojamiento: { icon: BedDouble, tone: 'hotel' },
  Transporte: { icon: Bus, tone: 'transport' },
  Comida: { icon: Utensils, tone: 'restaurant' },
  Actividades: { icon: Ticket, tone: 'activity' },
  Compras: { icon: ShoppingBag, tone: 'place' },
  Seguros: { icon: ShieldCheck, tone: 'info' },
  Visados: { icon: Stamp, tone: 'flight' },
  Otros: { icon: Receipt, tone: 'other' },
}

export function categoryLook(category: string): { icon: LucideIcon; tone: Tone } {
  return CATEGORY_LOOK[category] ?? CATEGORY_LOOK.Otros
}

/** Categoría de gasto que corresponde a un tipo de actividad del itinerario. */
export function expenseCategoryFor(activityType: string): string {
  if (activityType === 'flight' || activityType === 'transport') return 'Transporte'
  if (activityType === 'hotel') return 'Alojamiento'
  if (activityType === 'restaurant') return 'Comida'
  return 'Actividades'
}

/** Convierte un importe a la divisa base; null si no hay tipo de cambio. */
export function toBase(amount: number, currency: string, base: string, rates: Record<string, number> | undefined): number | null {
  if (currency === base) return amount
  const r = rates?.[currency]
  return r && r > 0 ? amount / r : null
}

export const today = () => new Date().toISOString().slice(0, 10)
