// Resultado de búsqueda ya normalizado y SERIALIZABLE: coordenadas planas, sin
// los getters de la API de Google. Así se puede cachear (y persistir) tal cual.
export interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  rating?: number
  lat: number
  lng: number
  types: string[]
  website?: string
  url?: string
}

// Lo que hay seleccionado en el mapa: un único concepto para resultado buscado,
// lugar guardado o parada del plan → una sola tarjeta inferior. Se guarda el
// identificador y no el objeto, para que la tarjeta refleje siempre el dato vivo.
export type MapSelection =
  | { kind: 'result'; id: string }
  | { kind: 'favorite'; id: string }
  | { kind: 'stop'; key: string }

export type TravelMode = 'DRIVING' | 'WALKING'
