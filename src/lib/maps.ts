import type { PlaceCategory } from '@/types/database'
import { PLACE_CATEGORY_COLORS } from '@/lib/utils'

export function placeTypeToCategory(types: string[]): PlaceCategory {
  if (types.some(t => ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'bakery', 'cafe'].includes(t))) {
    if (types.includes('cafe')) return 'cafe'
    return 'restaurant'
  }
  if (types.some(t => ['lodging', 'hotel'].includes(t))) return 'hotel'
  if (types.some(t => ['bar', 'night_club'].includes(t))) return 'bar'
  if (types.some(t => ['clothing_store', 'shopping_mall', 'store', 'shoe_store'].includes(t))) return 'shop'
  if (types.some(t => [
    'museum', 'art_gallery', 'tourist_attraction', 'amusement_park',
    'aquarium', 'zoo', 'stadium', 'church', 'place_of_worship',
    'natural_feature', 'park',
  ].includes(t))) return 'attraction'
  return 'other'
}

export function getCategoryColor(category: PlaceCategory): string {
  return PLACE_CATEGORY_COLORS[category] ?? '#6b7280'
}

export function buildMarkerSvg(color: string): string {
  return `
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24S28 23.33 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>
  `
}

