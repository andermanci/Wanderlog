import { UtensilsCrossed, BedDouble, Landmark, Coffee, Martini, Store, Bookmark, type LucideProps } from 'lucide-react'

// Icono por tipo de lugar, compartido por el mapa y la lista. Elegidos para
// distinguirse de los glifos POI de Google (tenedor/cuchara, copa, bolsa…):
// usamos cubiertos cruzados, copa de cóctel, tienda, etc.
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  restaurant: UtensilsCrossed,
  hotel: BedDouble,
  attraction: Landmark,
  cafe: Coffee,
  bar: Martini,
  shop: Store,
  other: Bookmark,
}

export function PlaceIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = ICONS[category] ?? Bookmark
  return <Icon {...props} />
}
