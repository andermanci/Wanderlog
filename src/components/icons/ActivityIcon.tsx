import { Plane, BedDouble, Utensils, Sparkles, Bus, MapPin, CircleDot, type LucideProps } from 'lucide-react'

// Icono de línea por tipo de actividad (consistente y profesional, sin emoji).
const MAP: Record<string, React.ComponentType<LucideProps>> = {
  flight: Plane,
  hotel: BedDouble,
  restaurant: Utensils,
  activity: Sparkles,
  transport: Bus,
  place: MapPin,
  other: CircleDot,
}

export function ActivityIcon({ type, ...props }: { type: string } & LucideProps) {
  const Icon = MAP[type] ?? CircleDot
  return <Icon {...props} />
}
