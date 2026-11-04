import type { ChangeKind } from '@/lib/versions/diff'
import type { ItineraryVersion } from '@/types/database'

// Colores fijos de las dos versiones que se comparan. A es la referencia (lo
// que hay), B la candidata: B lleva el color de la marca porque es la que se
// está valorando, y A un azul tranquilo que no compite con ella.
export const SIDE = {
  a: { color: 'var(--info)', soft: 'color-mix(in srgb, var(--info) 12%, transparent)' },
  b: { color: 'var(--primary)', soft: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
} as const

export const CHANGE: Record<Exclude<ChangeKind, 'same'> | 'removed' | 'out', { label: string; color: string }> = {
  moved: { label: 'Cambiado de día', color: 'var(--chart-2)' },
  time: { label: 'Nueva hora', color: 'var(--warning)' },
  added: { label: 'Añadido', color: 'var(--success)' },
  removed: { label: 'Quitado', color: 'var(--destructive)' },
  out: { label: 'Se va a otro día', color: 'var(--muted-foreground)' },
}

export const SOURCE_LABEL: Record<ItineraryVersion['source'], string> = {
  manual: 'Guardada por ti',
  auto: 'Copia automática',
  claude: 'Propuesta de Claude',
}

export const soft = (color: string, pct = 14) => `color-mix(in srgb, ${color} ${pct}%, transparent)`
