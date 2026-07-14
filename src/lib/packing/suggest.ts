// Genera la lista de equipaje a partir de lo que la app YA SABE del viaje:
// cuántos días dura, qué tiempo va a hacer, qué tipo de actividades hay, cuánta
// gente va y qué enchufe usan en el destino (que la guía saca de Wikidata y
// hasta ahora no servía para nada).
//
// Hasta ahora eran 3 plantillas fijas que ignoraban el viaje entero — y que si
// las aplicabas dos veces, duplicaban los items.
//
// PURO: sin red y sin React.

export interface SuggestInput {
  /** Noches del viaje. */
  nights: number
  /** Temperatura mínima esperada (previsión o clima típico). */
  tmin?: number | null
  /** Temperatura máxima esperada. */
  tmax?: number | null
  /** Proporción de días con lluvia esperada (0–1). */
  rainyRatio?: number | null
  /** Títulos y tipos de las actividades del itinerario, para detectar el plan. */
  activities?: Array<{ title: string; type: string }>
  /** Nº de viajeros (>1 ⇒ botiquín y adaptadores compartidos, no por persona). */
  travelers?: number
  /** Tipo de enchufe del destino, de la guía (Wikidata P2853). */
  plug?: string | null
}

export interface SuggestedItem {
  category: string
  name: string
  /** Por qué está en la lista. Se enseña al usuario: es lo que la hace creíble. */
  reason?: string
}

/** Etiquetas de actividad que delatan un plan concreto. */
const PLANS = {
  beach: /\b(playa|beach|costa|snorkel|buceo|surf|isla|cala)\b/i,
  hiking: /\b(senderismo|trekking|hiking|monta[ñn]a|ruta|volc[aá]n|cumbre|parque nacional)\b/i,
  formal: /\b([oó]pera|teatro|michelin|gala|boda|concierto)\b/i,
  swim: /\b(piscina|termas|onsen|spa|balneario|aguas termales)\b/i,
}

function detectPlans(activities: SuggestInput['activities']) {
  const text = (activities ?? []).map(a => `${a.title} ${a.type}`).join(' ')
  return {
    beach: PLANS.beach.test(text),
    hiking: PLANS.hiking.test(text),
    formal: PLANS.formal.test(text),
    swim: PLANS.swim.test(text),
  }
}

export function suggestPacking(input: SuggestInput): SuggestedItem[] {
  const { nights, tmin, tmax, rainyRatio, plug } = input
  const days = Math.max(1, nights + 1)
  const plans = detectPlans(input.activities)
  const out: SuggestedItem[] = []

  const add = (category: string, name: string, reason?: string) => out.push({ category, name, reason })

  // --- Documentación ---
  add('Documentación', 'Pasaporte o DNI')
  add('Documentación', 'Tarjeta bancaria')

  // --- Ropa, en cantidades proporcionales al viaje ---
  // Para más de una semana no tiene sentido llevar una camiseta por día: se
  // asume que se lava.
  const sets = Math.min(days, 7)
  const nights7 = nights > 7 ? ' (para una semana: darás una lavadora)' : ''
  add('Ropa', `Camisetas ×${sets}`, `${days} ${days === 1 ? 'día' : 'días'} de viaje${nights7}`)
  add('Ropa', `Ropa interior ×${sets}`)
  add('Ropa', `Calcetines ×${sets}`)
  add('Ropa', `Pantalones ×${Math.max(1, Math.ceil(sets / 3))}`)
  add('Ropa', 'Zapatos cómodos')

  // --- Ropa según el tiempo ---
  if (typeof tmin === 'number') {
    if (tmin < 0) {
      add('Ropa', 'Abrigo de invierno', `van a caer ${tmin}° de mínima`)
      add('Ropa', 'Guantes y gorro', `van a caer ${tmin}° de mínima`)
      add('Ropa', 'Bufanda')
    } else if (tmin < 10) {
      add('Ropa', 'Abrigo', `van a caer ${tmin}° de mínima`)
      add('Ropa', 'Jersey o sudadera')
    } else if (tmin < 16) {
      add('Ropa', 'Chaqueta ligera', `refresca por la noche (${tmin}°)`)
    }
  }
  if (typeof tmax === 'number' && tmax >= 26) {
    add('Ropa', 'Ropa ligera', `se esperan ${tmax}° de máxima`)
    add('Aseo', 'Crema solar', `se esperan ${tmax}° de máxima`)
    add('Ropa', 'Gorra o sombrero')
  }
  if (typeof rainyRatio === 'number' && rainyRatio >= 0.25) {
    const pct = Math.round(rainyRatio * 100)
    add('Ropa', 'Chubasquero o paraguas', `llueve alrededor del ${pct} % de los días`)
  }

  // --- Según el plan que haya en el itinerario ---
  if (plans.beach || plans.swim) {
    add('Playa', 'Bañador', plans.beach ? 'hay playa en el itinerario' : 'hay piscina o termas en el itinerario')
    add('Playa', 'Toalla')
    add('Playa', 'Chanclas')
  }
  if (plans.hiking) {
    add('Montaña', 'Botas de trekking', 'hay rutas en el itinerario')
    add('Montaña', 'Mochila pequeña')
    add('Montaña', 'Cantimplora')
  }
  if (plans.formal) {
    add('Ropa', 'Ropa formal', 'hay algo de etiqueta en el itinerario')
  }

  // --- Aseo y salud ---
  add('Aseo', 'Cepillo y pasta de dientes')
  add('Aseo', 'Desodorante')
  add('Aseo', 'Champú y gel')
  add('Salud', 'Medicación habitual')
  add('Salud', 'Analgésicos y tiritas')

  // --- Electrónica ---
  add('Electrónica', 'Móvil y cargador')
  if (plug) {
    add('Electrónica', `Adaptador de enchufe (tipo ${plug})`, `en el destino usan el enchufe tipo ${plug}`)
  } else {
    add('Electrónica', 'Adaptador de enchufe')
  }
  if (nights >= 3) add('Electrónica', 'Batería externa')

  return out
}

/**
 * Quita de las sugerencias lo que ya está en la lista. Sin esto, generar dos
 * veces duplicaba todo — que es justo lo que hacían las plantillas de antes.
 */
export function dedupeAgainst(
  suggestions: SuggestedItem[],
  existing: Array<{ name: string }>,
): SuggestedItem[] {
  // Se compara sin tildes, sin mayúsculas y sin la cantidad ("Camisetas ×5" ya
  // está si hay unas "camisetas").
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*×\s*\d+\s*$/, '')
    .trim()

  const have = new Set(existing.map(e => normalize(e.name)))
  return suggestions.filter(s => !have.has(normalize(s.name)))
}
