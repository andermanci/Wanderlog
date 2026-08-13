import type { Activity, ItineraryDay, Trip } from '@/types/database'
import { cityNames } from '@/lib/cities'

export type AudioguideDetailLevel = 'rapida' | 'estandar' | 'exhaustiva'

/** De qué habla la audioguía: un sitio del itinerario o la ciudad de un día. */
export type AudioguideKind = 'activity' | 'day'

export interface AudioguideDetailLevelOption {
  id: AudioguideDetailLevel
  label: string
  description: string
}

export const AUDIOGUIDE_DETAIL_LEVELS: AudioguideDetailLevelOption[] = [
  {
    id: 'rapida',
    label: 'Rápida',
    description: 'Pocas paradas (4-6) y explicaciones breves: solo lo esencial de cada una. Para una visita corta o de repaso.',
  },
  {
    id: 'estandar',
    label: 'Estándar',
    description: 'Paradas moderadas (8-12) con guiones de longitud media: contexto histórico y artístico sin alargarse. Un buen equilibrio.',
  },
  {
    id: 'exhaustiva',
    label: 'Exhaustiva',
    description: 'Muchísimas paradas (una por cada sala u obra relevante) con guiones largos: historia, arte, técnica y anécdotas al detalle. Para dedicarle tiempo de verdad.',
  },
]

// Las mismas tres intensidades, contadas para un paseo por la ciudad: aquí una
// parada no es una sala sino una plaza o un puente, así que ni el número ni el
// criterio para elegirlas se parecen a los de un museo.
export const DAY_AUDIOGUIDE_DETAIL_LEVELS: AudioguideDetailLevelOption[] = [
  {
    id: 'rapida',
    label: 'Rápida',
    description: 'Un paseo corto (5-7 paradas) por lo imprescindible de la ciudad. Para hacerse una idea sin dedicarle la mañana.',
  },
  {
    id: 'estandar',
    label: 'Estándar',
    description: 'Un recorrido de verdad (10-14 paradas) por el centro histórico, con la historia de la ciudad hilada entre parada y parada.',
  },
  {
    id: 'exhaustiva',
    label: 'Exhaustiva',
    description: 'La ciudad a fondo (18 o más paradas), incluyendo barrios de fuera del circuito, vida cotidiana y rincones que no salen en las guías.',
  },
]

export function detailLevelsFor(kind: AudioguideKind): AudioguideDetailLevelOption[] {
  return kind === 'day' ? DAY_AUDIOGUIDE_DETAIL_LEVELS : AUDIOGUIDE_DETAIL_LEVELS
}

interface LevelConfig {
  paradas: string
  palabras: string
  profundidad: string
}

const LEVEL_CONFIG: Record<AudioguideDetailLevel, LevelConfig> = {
  rapida: {
    paradas: 'entre 4 y 6 paradas, cubriendo solo los puntos más destacados e imprescindibles del lugar',
    palabras: '100 a 150',
    profundidad: 've al grano: qué es y por qué es importante, sin extenderte en detalles secundarios',
  },
  estandar: {
    paradas: 'entre 8 y 12 paradas, cubriendo las salas y obras más relevantes',
    palabras: '200 a 280',
    profundidad: 'con contexto histórico y artístico básico, sin agotar cada detalle',
  },
  exhaustiva: {
    paradas: 'tantas paradas como sean necesarias para cubrir el lugar en profundidad, dedicando una parada propia a cada sala, obra destacada, elemento arquitectónico o punto de interés relevante (piensa en un mínimo de 15, y muchas más si el lugar es grande; yo luego decidiré qué escuchar y qué saltarme, así que prefiero que te pases a que te quedes corto)',
    palabras: '300 a 450',
    profundidad: 'profundiza al máximo: datos históricos, artísticos, técnicos y anecdóticos, curiosidades, simbolismo, contexto de la época, etc.',
  },
}

const DAY_LEVEL_CONFIG: Record<AudioguideDetailLevel, LevelConfig> = {
  rapida: {
    paradas: 'entre 5 y 7 paradas con los hitos imprescindibles del centro histórico',
    palabras: '120 a 180',
    profundidad: 've al grano: qué estoy viendo y por qué importa en la historia de la ciudad',
  },
  estandar: {
    paradas: 'entre 10 y 14 paradas que recorran el centro histórico y algún barrio con carácter propio',
    palabras: '200 a 280',
    profundidad: 'hila la historia de la ciudad de una parada a otra, mezclando arquitectura, vida cotidiana y algún detalle curioso',
  },
  exhaustiva: {
    paradas: '18 paradas o más, saliendo también del circuito turístico principal: barrios periféricos con interés, mercados, calles concretas y rincones que no salen en las guías (yo decidiré luego qué escuchar y qué saltarme, así que prefiero que te pases a que te quedes corto)',
    palabras: '300 a 450',
    profundidad: 'profundiza al máximo: historia, urbanismo, economía, arte, costumbres, gastronomía, personajes y anécdotas',
  },
}

// Bloque de formato de salida. Vive aquí una sola vez porque es el contrato con
// parseAudioguideText: si cambia el formato, cambia en los dos prompts a la vez
// o uno de los dos deja de parsearse.
function outputFormat(): string {
  return `Devuelve EXCLUSIVAMENTE el resultado en este formato exacto, sin ningún texto antes o después, sin markdown, una parada tras otra:

###PARADA###
TITULO: <título corto de la parada>
RESUMEN: <una frase que resuma de qué trata esta parada>
DIRECCION: <cómo dirigirse hasta aquí desde la parada anterior>
LUGAR: <nombre buscable en Google Maps con la ciudad, o NINGUNO>
COORDENADAS: <latitud, longitud> (por ejemplo 43.77313, 11.25596), o NINGUNO
GUION: <texto narrado>
###FIN###`
}

const CAMPOS_COMUNES = `- Un título corto que identifique la parada.
- Un resumen de una sola frase (máximo 25 palabras) que diga de qué trata esa parada, para poder decidir de un vistazo si escucharla o saltarla.
- Una indicación clara de hacia dónde dirigirse desde la parada anterior (en la primera parada, cómo llegar o por dónde empezar).`

// Construye el prompt que se copia al portapapeles para pegar en Claude.
// El formato de salida pedido es el que luego entiende parseAudioguideText.
export function buildAudioguidePrompt(
  activity: Activity,
  trip: Trip,
  level: AudioguideDetailLevel = 'estandar',
): string {
  const lugar = [activity.title, activity.address, trip.destination]
    .filter(Boolean)
    .join(', ')

  const contexto = [activity.description, activity.notes]
    .filter(Boolean)
    .join('\n')

  const cfg = LEVEL_CONFIG[level]

  return `Eres un guía turístico profesional y experto en historia del arte. Necesito que generes el guion de una audioguía en español para visitar: ${lugar}.
${contexto ? `\nContexto adicional sobre el lugar:\n${contexto}\n` : ''}
Divide la visita en ${cfg.paradas}. Sigue un recorrido físico razonable dentro del lugar.

Para cada parada incluye:
${CAMPOS_COMUNES}
- La ubicación de la parada, para poder situarla en un mapa: el nombre del sitio tal y como se buscaría en Google Maps (con la ciudad incluida) y sus coordenadas en grados decimales con 5 decimales. Si la parada NO es un sitio propio —está dentro del mismo edificio o recinto que la anterior (una sala, una obra, un detalle), o no es un lugar físico (consejos, horarios, dónde comer)—, escribe NINGUNO en las dos líneas.
- Un guion narrado de ${cfg.palabras} palabras, con tono cercano y profesional; ${cfg.profundidad}.

${outputFormat()}`
}

// Audioguía de la ciudad del día, no de un sitio concreto. El sujeto es la
// ciudad entera: el paseo entre parada y parada, el barrio, por qué la ciudad
// es como es. Se le pasan las actividades del día para que el recorrido pase
// por donde ya vas a estar y NO repita lo que ya cuenta la audioguía del sitio.
export function buildDayAudioguidePrompt(
  day: ItineraryDay,
  trip: Trip,
  dayActivities: Activity[],
  level: AudioguideDetailLevel = 'estandar',
): string {
  const ciudades = cityNames(day)
  // Sin ciudades escritas en el día, el destino del viaje es la mejor pista que
  // hay: más vale una audioguía de "Italia" que ninguna.
  const lugar = ciudades.length > 0 ? ciudades.join(' y ') : trip.destination

  const visitas = dayActivities
    .filter((a) => a.title?.trim())
    .map((a) => `- ${a.title}${a.address ? ` (${a.address})` : ''}`)

  const cfg = DAY_LEVEL_CONFIG[level]

  const bloqueVisitas = visitas.length > 0
    ? `\nEse día ya tengo previstas estas visitas:\n${visitas.join('\n')}\n\nTenlas en cuenta de dos maneras: haz que el recorrido pase cerca de ellas para que encaje con mi día, y cuando el paseo llegue a una, cuéntala solo por fuera (qué es, por qué está ahí, qué se ve desde la calle) SIN entrar en detalle en su interior ni en sus obras, porque para eso tengo una audioguía aparte de cada sitio.\n`
    : ''

  return `Eres un guía turístico profesional y experto en historia urbana. Necesito que generes el guion de una audioguía en español sobre la ciudad de ${lugar}${ciudades.length > 1 ? '' : `, en ${trip.destination}`}, para escucharla paseando por la calle durante un día entero de visita.

No es la audioguía de un museo ni de un monumento concreto: el sujeto es la ciudad. Quiero entender por qué esta ciudad es como es —su origen, cómo creció, de qué vivió y vive, qué la hace distinta de cualquier otra— mientras camino por ella.
${bloqueVisitas}
Diseña un recorrido a pie con ${cfg.paradas}. Ordénalas siguiendo un itinerario andando que tenga sentido geográfico, sin ir y volver: cada parada debe quedar razonablemente cerca de la anterior.

Para cada parada incluye:
${CAMPOS_COMUNES}
- La ubicación de la parada: el nombre del sitio tal y como se buscaría en Google Maps (con la ciudad incluida) y sus coordenadas en grados decimales con 5 decimales. Aquí casi todas las paradas SÍ son sitios reales de la calle (plazas, puentes, fachadas, mercados, miradores), así que rellena los dos campos siempre que puedas; escribe NINGUNO solo si la parada no es un lugar físico (una introducción general, consejos prácticos).
- Un guion narrado de ${cfg.palabras} palabras, con tono cercano y profesional, de alguien que conoce bien la ciudad; ${cfg.profundidad}.

Empieza por una parada de introducción que resuma en qué ciudad estoy y qué voy a entender durante el paseo. Reparte la historia a lo largo del recorrido en vez de soltarla toda al principio: cada parada debe aportar un trozo del relato, no repetir lo anterior.

${outputFormat()}`
}
