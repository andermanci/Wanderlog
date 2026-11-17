import {
  Plane, BedDouble, Utensils, Sparkles, Bus, MapPin, CircleDot,
  TrainFront, Car, CarTaxiFront, Ticket, Flag, ShieldCheck, FileText, BookUser, IdCard, Stamp,
  HeartPulse, Syringe, UtensilsCrossed, Coffee, Wine, ShoppingBag, Landmark,
  type LucideIcon,
} from 'lucide-react'

// Un icono de línea por tipo. Siempre el mismo en toda la app.
export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  restaurant: Utensils,
  activity: Sparkles,
  transport: Bus,
  place: MapPin,
  other: CircleDot,
}

export const DOC_ICONS: Record<string, LucideIcon> = {
  // Documentación personal
  passport: BookUser,
  dni: IdCard,
  visa: Stamp,
  driving_license: Car,
  health_card: HeartPulse,
  vaccines: Syringe,
  // Reservas y billetes
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  hotel: BedDouble,
  car_rental: Car,
  transfer: CarTaxiFront,
  tour: Flag,
  ticket: Ticket,
  insurance: ShieldCheck,
  other: FileText,
  // Solo para agrupar adjuntos del itinerario; no es categoría de documento.
  restaurant: UtensilsCrossed,
}

export const PLACE_ICONS: Record<string, LucideIcon> = {
  restaurant: Utensils,
  hotel: BedDouble,
  attraction: Landmark,
  cafe: Coffee,
  bar: Wine,
  shop: ShoppingBag,
  other: MapPin,
}
