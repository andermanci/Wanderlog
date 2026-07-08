import type { Activity, Trip } from '@/types/database'

export type AudioguideDetailLevel = 'rapida' | 'estandar' | 'exhaustiva'

export const AUDIOGUIDE_DETAIL_LEVELS: {
  id: AudioguideDetailLevel
  label: string
  description: string
}[] = [
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

const LEVEL_CONFIG: Record<AudioguideDetailLevel, { paradas: string; palabras: string; profundidad: string }> = {
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
- Un título corto que identifique la parada (por ejemplo el nombre de la obra, sala o elemento).
- Un resumen de una sola frase (máximo 25 palabras) que diga de qué trata esa parada, para poder decidir de un vistazo si escucharla o saltarla.
- Una indicación clara de hacia dónde dirigirse desde la parada anterior (en la primera parada, cómo llegar o por dónde empezar la visita).
- Un guion narrado de ${cfg.palabras} palabras, con tono cercano y profesional; ${cfg.profundidad}.

Devuelve EXCLUSIVAMENTE el resultado en este formato exacto, sin ningún texto antes o después, sin markdown, una parada tras otra:

###PARADA###
TITULO: <título corto de la parada>
RESUMEN: <una frase que resuma de qué trata esta parada>
DIRECCION: <cómo dirigirse hasta aquí desde la parada anterior>
GUION: <texto narrado>
###FIN###`
}
