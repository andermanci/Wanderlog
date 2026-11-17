import { toast } from 'sonner'
import type { FavoritePlace } from '@/types/database'
import type { PendingPlace } from './AddToPlanPanel'

/** Nombres de las listas (colecciones) que ya existen en el viaje, en orden alfabético. */
export function collectionsOf(places: FavoritePlace[] | undefined): string[] {
  return Array.from(
    new Set((places ?? []).map(p => p.collection?.trim()).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b))
}

/** Un lugar guardado, en la forma que pide «Añadir al plan». */
export function pendingFromFavorite(p: FavoritePlace): PendingPlace {
  return { name: p.name, address: p.address, link: p.link, place_id: p.google_place_id, lat: p.lat, lng: p.lng, category: p.category }
}

/** Copia una dirección al portapapeles y avisa del resultado. */
export function copyAddress(text: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success('Dirección copiada'))
    .catch(() => toast.error('No se ha podido copiar la dirección'))
}

/** Abre un enlace externo en otra pestaña. */
export function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
