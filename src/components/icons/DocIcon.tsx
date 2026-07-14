import {
  Plane, TrainFront, Bus, BedDouble, Car, CarTaxiFront, Ticket, Flag,
  ShieldCheck, FileText, BookUser, IdCard, Stamp, HeartPulse, UtensilsCrossed,
  type LucideProps,
} from 'lucide-react'

// Icono de línea por categoría de documento (identidad + reservas/billetes).
const MAP: Record<string, React.ComponentType<LucideProps>> = {
  // Documentación personal
  passport: BookUser,
  dni: IdCard,
  visa: Stamp,
  driving_license: Car,
  health_card: HeartPulse,
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
  // Solo para agrupar adjuntos del itinerario, no es categoría de documento.
  restaurant: UtensilsCrossed,
}

export function DocIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = MAP[category] ?? FileText
  return <Icon {...props} />
}
