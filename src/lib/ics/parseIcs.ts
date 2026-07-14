import { parse, Component, Event } from 'ical.js'
import type { Document } from '@/types/database'

// Lectura del .ics que mandan las aerolíneas, los hoteles y las agencias.
// Hasta ahora el vuelo había que meterlo DOS veces: una como actividad del
// itinerario y otra como documento con el localizador. Esto crea las dos de una
// pasada, ya enlazadas.
//
// El parseo de verdad (plegado de líneas a 75 octetos, escapado de comas, DATE
// frente a DATE-TIME, TZID) lo hace ical.js, que ya estaba instalado en el
// proyecto sin que nadie lo usara.
//
// PURO: sin red y sin React, para poder testearlo con .ics reales.

export type BookingCategory = Extract<
  Document['category'],
  'flight' | 'train' | 'bus' | 'hotel' | 'car_rental' | 'transfer' | 'tour' | 'ticket' | 'other'
>

export interface IcsBooking {
  /** UID del VEVENT: identifica la reserva si se reimporta el mismo fichero. */
  uid: string
  title: string
  category: BookingCategory
  /** Instante ISO de inicio. */
  start: string
  end: string | null
  /** Evento de día completo: no tiene hora útil. */
  allDay: boolean
  location: string | null
  locator: string | null
  provider: string | null
  origin: string | null
  destination: string | null
  notes: string | null
}

// Palabras clave por categoría, en orden de prioridad: la primera que casa gana.
const CATEGORY_RULES: Array<{ category: BookingCategory; pattern: RegExp }> = [
  { category: 'flight', pattern: /\b(vuelo|flight|vol|volo|iberia|ryanair|vueling|easyjet|air ?europa|lufthansa|british airways|emirates|boarding)\b/i },
  { category: 'train', pattern: /\b(tren|train|renfe|ave|alvia|avlo|ouigo|iryo|trenitalia|sncf|eurostar)\b/i },
  { category: 'bus', pattern: /\b(bus|autob[uú]s|alsa|flixbus|blablacar|coach)\b/i },
  { category: 'hotel', pattern: /\b(hotel|booking\.com|airbnb|hostal|apartamento|apartment|check-?in|alojamiento|resort|albergue)\b/i },
  { category: 'car_rental', pattern: /\b(alquiler|rent ?a ?car|car ?rental|hertz|avis|europcar|sixt|goldcar)\b/i },
  { category: 'transfer', pattern: /\b(traslado|transfer|shuttle|taxi)\b/i },
  { category: 'tour', pattern: /\b(tour|visita guiada|excursi[oó]n|guided|getyourguide|civitatis)\b/i },
  { category: 'ticket', pattern: /\b(entrada|ticket|museo|museum|concierto|concert|espect[aá]culo)\b/i },
]

function classify(text: string): BookingCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category
  }
  return 'other'
}

// Localizador / PNR. Los emisores lo escriben de mil maneras, así que se buscan
// las etiquetas más comunes en español y en inglés antes de aceptar el código.
const LOCATOR_PATTERNS = [
  /(?:localizador|c[oó]digo de reserva|reserva|reference|booking (?:reference|code|number)|confirmation (?:number|code)|record locator|pnr)\s*[:#]?\s*([A-Z0-9]{5,10})\b/i,
]

function extractLocator(text: string): string | null {
  for (const pattern of LOCATOR_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return match[1].toUpperCase()
  }
  return null
}

// Trayecto: "MAD → BCN", "Madrid - Barcelona", "Madrid (MAD) a Tokio (NRT)".
const ROUTE_PATTERN = /([\p{L}\s.'()-]{2,40}?)\s*(?:→|->|–|—|-|\ba\b|\bto\b)\s*([\p{L}\s.'()-]{2,40})$/u

function extractRoute(title: string): { origin: string | null; destination: string | null } {
  const match = ROUTE_PATTERN.exec(title.trim())
  if (!match) return { origin: null, destination: null }
  const origin = match[1].trim()
  const destination = match[2].trim()
  if (!origin || !destination) return { origin: null, destination: null }
  return { origin, destination }
}

// Aerolínea / operador: "Vuelo IB3106" → "IB3106".
const FLIGHT_NUMBER = /\b([A-Z]{2}\s?\d{2,4})\b/

function extractProvider(title: string, category: BookingCategory): string | null {
  if (category === 'flight') {
    const match = FLIGHT_NUMBER.exec(title.toUpperCase())
    if (match) return match[1].replace(/\s/g, '')
  }
  for (const rule of CATEGORY_RULES) {
    const match = rule.pattern.exec(title)
    // Solo devolvemos la marca si aparece literalmente (Iberia, Renfe, Hertz…),
    // no la palabra genérica del tipo ("vuelo", "hotel").
    if (match && match[0].length > 4 && !/^(vuelo|flight|hotel|tren|train|bus|tour|ticket|entrada|reserva)$/i.test(match[0])) {
      return match[0]
    }
  }
  return null
}

/**
 * Lee un .ics y devuelve las reservas que contiene, ya clasificadas.
 * Devuelve [] si el fichero no es un calendario válido (nunca lanza).
 */
export function parseIcs(content: string): IcsBooking[] {
  let events: Event[]
  try {
    const component = new Component(parse(content))
    events = component.getAllSubcomponents('vevent').map(v => new Event(v))
  } catch {
    return []
  }

  const bookings: IcsBooking[] = []

  for (const event of events) {
    const start = event.startDate
    if (!start) continue

    const title = (event.summary || 'Reserva').trim()
    const description = (event.description || '').trim()
    const location = (event.location || '').trim()

    // Se clasifica con todo el texto disponible: el tipo suele estar en el
    // asunto, pero el localizador casi siempre está en la descripción.
    const haystack = `${title}\n${description}\n${location}`
    const category = classify(haystack)
    const route = category === 'flight' || category === 'train' || category === 'bus' || category === 'transfer'
      ? extractRoute(title)
      : { origin: null, destination: null }

    bookings.push({
      uid: event.uid || `${title}-${start.toJSDate().toISOString()}`,
      title,
      category,
      start: start.toJSDate().toISOString(),
      end: event.endDate ? event.endDate.toJSDate().toISOString() : null,
      allDay: start.isDate,
      location: location || null,
      locator: extractLocator(haystack),
      provider: extractProvider(title, category),
      origin: route.origin,
      destination: route.destination,
      notes: description || null,
    })
  }

  return bookings.sort((a, b) => a.start.localeCompare(b.start))
}

/** Tipo de actividad del itinerario que le corresponde a una reserva. */
export function activityTypeFor(category: BookingCategory) {
  if (category === 'flight') return 'flight' as const
  if (category === 'hotel') return 'hotel' as const
  if (category === 'train' || category === 'bus' || category === 'transfer' || category === 'car_rental') {
    return 'transport' as const
  }
  return 'activity' as const
}
