import type { DayCity, ItineraryDay } from '@/types/database'

const DIACRITICS = /[̀-ͯ]/g
const key = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()

type DayLike = Pick<ItineraryDay, 'cities'> | null | undefined

// Las ciudades de un día, siempre como lista. Defensivo a propósito: la caché
// offline puede devolver días guardados antes de que existiera la columna.
export function dayCities(day: DayLike): DayCity[] {
  return Array.isArray(day?.cities) ? day.cities.filter(c => c && c.name?.trim()) : []
}

export function cityNames(day: DayLike): string[] {
  return dayCities(day).map(c => c.name.trim())
}

// Lo que se pinta junto a la fecha: "Roma · Tívoli", o nada si el día no dice
// dónde estás.
export function citiesLabel(day: DayLike): string | null {
  const names = cityNames(day)
  return names.length ? names.join(' · ') : null
}

export function hasGuide(day: DayLike, guideId: string): boolean {
  return dayCities(day).some(c => c.guide_id === guideId)
}

// La misma ciudad no se repite: cuenta como repetida si comparte guía o si el
// nombre coincide ignorando tildes y mayúsculas ("Tivoli" y "Tívoli").
export function addCity(cities: DayCity[], city: DayCity): DayCity[] {
  const name = city.name.trim()
  if (!name) return cities
  const dup = cities.some(c =>
    (city.guide_id && c.guide_id === city.guide_id) || key(c.name) === key(name))
  return dup ? cities : [...cities, { name, guide_id: city.guide_id }]
}

export function removeCityAt(cities: DayCity[], index: number): DayCity[] {
  return cities.filter((_, i) => i !== index)
}

export function removeGuide(cities: DayCity[], guideId: string): DayCity[] {
  return cities.filter(c => c.guide_id !== guideId)
}

// Los nombres de guía cambian (se editan en la guía del destino): manda la guía,
// y el nombre guardado solo sobrevive si ya no existe.
export function resolveNames(cities: DayCity[], guides: { id: string; name: string }[] | undefined): DayCity[] {
  if (!guides?.length) return cities
  return cities.map(c => {
    const g = c.guide_id ? guides.find(x => x.id === c.guide_id) : undefined
    return g && g.name !== c.name ? { ...c, name: g.name } : c
  })
}
