import { CircleDot, FileText, MapPin, type LucideProps } from 'lucide-react'
import { ACTIVITY_ICONS, DOC_ICONS, PLACE_ICONS } from './iconMaps'


// Un icono de línea por tipo. Siempre el mismo en toda la app.

export function ActivityIcon({ type, ...props }: { type: string } & LucideProps) {
  const Icon = ACTIVITY_ICONS[type] ?? CircleDot
  return <Icon aria-hidden="true" {...props} />
}


export function DocIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = DOC_ICONS[category] ?? FileText
  return <Icon aria-hidden="true" {...props} />
}


export function PlaceIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = PLACE_ICONS[category] ?? MapPin
  return <Icon aria-hidden="true" {...props} />
}
