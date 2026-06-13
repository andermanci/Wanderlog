import { Utensils, BedDouble, Landmark, Coffee, Wine, ShoppingBag, MapPin, type LucideProps } from 'lucide-react'

// Icono por tipo de lugar, compartido por el mapa y la lista. Iconos de línea
// (lucide) en lugar de emoji: se distinguen mejor de un vistazo.
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  restaurant: Utensils,
  hotel: BedDouble,
  attraction: Landmark,
  cafe: Coffee,
  bar: Wine,
  shop: ShoppingBag,
  other: MapPin,
}

export function PlaceIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = ICONS[category] ?? MapPin
  return <Icon {...props} />
}
