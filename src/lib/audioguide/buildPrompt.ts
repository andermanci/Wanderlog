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

// Las mismas tres intensidades, contadas para la audioguía de una ciudad. Aquí
// una «parada» no es un sitio sino un CAPÍTULO: un tema del que hablar. Lo que
// son los sitios ya lo cuenta la audioguía de cada actividad, y repetirlo era
// justo el problema.
export const DAY_AUDIOGUIDE_DETAIL_LEVELS: AudioguideDetailLevelOption[] = [
  {
    id: 'rapida',
    label: 'Rápida',
    description: 'Lo esencial en 5-7 capítulos: de dónde sale la ciudad y qué la hace distinta. Para hacerse una idea de camino.',
  },
  {
    id: 'estandar',
    label: 'Estándar',
    description: '10-14 capítulos con la historia de la ciudad bien contada, sus personajes, sus costumbres y unas cuantas curiosidades.',
  },
  {
    id: 'exhaustiva',
    label: 'Exhaustiva',
    description: 'La ciudad a fondo en 18 capítulos o más: historia, economía, urbanismo, comida, dichos y rarezas que no salen en las guías.',
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
    paradas: 'entre 5 y 7 capítulos con lo esencial para entender la ciudad',
    palabras: '120 a 180',
    profundidad: 've al grano: por qué la ciudad es como es y qué la distingue de cualquier otra',
  },
  estandar: {
    paradas: 'entre 10 y 14 capítulos',
    palabras: '200 a 280',
    profundidad: 'hila un relato de un capítulo al siguiente, mezclando historia, vida cotidiana y algún detalle curioso',
  },
  exhaustiva: {
    paradas: '18 capítulos o más (yo decidiré luego cuáles escuchar y cuáles saltarme, así que prefiero que te pases a que te quedes corto)',
    palabras: '300 a 450',
    profundidad: 'profundiza al máximo: historia, urbanismo, economía, costumbres, gastronomía, dichos, personajes y anécdotas',
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

// Audioguía de la ciudad del día. NO es un recorrido por sitios: de los sitios
// ya se encarga la audioguía de cada actividad, y oír dos veces el mismo
// monumento era justo el problema que resuelve esto. Aquí el sujeto es la
// ciudad como tal —de dónde sale, cómo creció, de qué vive, qué la hace rara—,
// contada por capítulos temáticos. Por eso las actividades del día entran como
// LISTA DE EXCLUSIÓN y no como paradas del camino.
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

  const excluidos = dayActivities
    .filter((a) => a.title?.trim())
    .map((a) => `- ${a.title}`)

  const cfg = DAY_LEVEL_CONFIG[level]

  const bloqueExclusion = excluidos.length > 0
    ? `\nMUY IMPORTANTE — de estos sitios NO debes hablar, porque ya tengo una audioguía dedicada a cada uno y no quiero oír lo mismo dos veces:\n${excluidos.join('\n')}\n\nNo les dediques un capítulo, no los uses de hilo conductor y no cuentes su historia. Puedes nombrarlos de pasada si es inevitable para explicar otra cosa (por ejemplo, al situar un barrio o una época), pero nunca como tema.\n`
    : ''

  return `Eres un guía turístico profesional y experto en historia urbana. Necesito que generes el guion de una audioguía en español sobre la ciudad de ${lugar}${ciudades.length > 1 ? '' : `, en ${trip.destination}`}, para escucharla el día que la visito: en el transporte, desayunando o andando por la calle.

No es la audioguía de un monumento ni un recorrido por sus lugares. El sujeto es la CIUDAD: quiero entender por qué es como es —su origen, cómo creció, de qué vivió y vive, quién mandó, qué se come y por qué, qué la hace distinta de cualquier otra— y llevarme unos cuantos datos que no vienen en las guías.
${bloqueExclusion}
Divide la audioguía en ${cfg.paradas}. Cada capítulo es un TEMA, no un sitio: el origen de la ciudad, el dinero que la levantó, un personaje que la marcó, una costumbre, un plato y su porqué, una rareza del idioma o del carácter local, un episodio histórico que la cambió. Ordénalos de manera que cuenten una historia, normalmente empezando por el origen y avanzando en el tiempo, y que ninguno repita lo dicho en otro.

Para cada capítulo incluye:
${CAMPOS_COMUNES}
- La ubicación: escribe NINGUNO en las dos líneas. Estos capítulos son temas y no se escuchan delante de un sitio concreto. La única excepción es que el capítulo trate de verdad de un lugar visitable que NO esté en la lista de exclusión de arriba; solo entonces pon su nombre buscable en Google Maps y sus coordenadas con 5 decimales.
- Un guion narrado de ${cfg.palabras} palabras, con tono cercano y profesional, de alguien que conoce bien la ciudad y sabe contarla; ${cfg.profundidad}.

Empieza por un capítulo de introducción que responda a «por qué existe esta ciudad y qué la hace distinta». Prefiere lo concreto a lo genérico: una fecha, una cifra, un nombre o una anécdota valen más que un adjetivo. Y no escribas frases de guía turística del tipo «no puedes perderte»: esto se escucha, no se lee en un folleto.

${outputFormat()}`
}
