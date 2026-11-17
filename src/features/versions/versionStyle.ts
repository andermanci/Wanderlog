import { toneColor, type Tone } from '@/design'
import type { ChangeKind } from '@/lib/versions/diff'
import type { ItineraryVersion } from '@/types/database'

export type Side = 'a' | 'b'

// Tonos fijos de las dos versiones que se comparan. A es la referencia (lo que
// hay) y B la candidata: B lleva el color de la marca porque es la que se está
// valorando, y A un azul tranquilo que no compite con ella. Además del color,
// A va siempre discontinua o en contorno y B continua o rellena.
export const SIDE_TONE: Record<Side, Tone> = { a: 'info', b: 'primary' }

export const CHANGE: Record<
  Exclude<ChangeKind, 'same'> | 'removed' | 'out' | 'place' | 'legNew' | 'legChanged' | 'legDropped',
  { label: string; tone: Tone }
> = {
  moved: { label: 'Cambiado de día', tone: 'transport' },
  time: { label: 'Nueva hora', tone: 'warning' },
  added: { label: 'Añadido', tone: 'success' },
  removed: { label: 'Quitado', tone: 'danger' },
  out: { label: 'Se va a otro día', tone: 'neutral' },
  place: { label: 'Ubicación corregida', tone: 'place' },
  legNew: { label: 'Ruta nueva', tone: 'success' },
  legChanged: { label: 'Ruta distinta', tone: 'warning' },
  legDropped: { label: 'No sigue en B', tone: 'neutral' },
}

// En la base de datos el origen se llama «claude» por historia; la propuesta
// puede venir de cualquier IA.
export const SOURCE_LABEL: Record<ItineraryVersion['source'], string> = {
  manual: 'Guardada por ti',
  auto: 'Copia automática',
  claude: 'Propuesta de una IA',
}

/**
 * El color de un tono en hexadecimal. Las polilíneas de Google Maps se pintan
 * en canvas y no entienden `oklch(...)`, que es lo que devuelve `toneColor`:
 * se pinta un píxel y se lee.
 */
export function toneHex(tone: Tone): string {
  const color = toneColor(tone)
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}
