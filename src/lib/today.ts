import { formatDuration } from '@/lib/timezone'
import type { Activity } from '@/types/database'

// Lógica del día en curso: en qué punto de la jornada estás. Vive aparte de la
// UI porque es donde están todos los casos raros (actividades sin hora, sin
// fin, o que cruzan medianoche) y conviene poder probarlos.

export const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export type DayState = 'past' | 'current' | 'upcoming'

export interface DayEntry {
  activity: Activity
  state: DayState
  /** "quedan 1 h 30" / "en 45 min". Vacío cuando no hay nada útil que decir. */
  relative: string
  /** Avance dentro de la actividad (0..1). null si no está en curso. */
  progress: number | null
}

/**
 * Clasifica las actividades de hoy respecto a `nowMin` (minutos desde
 * medianoche) y calcula cuánto falta o queda para cada una.
 *
 * Una actividad marcada como hecha cuenta como pasada aunque su hora aún no
 * haya llegado: manda lo que ha dicho el usuario, no el reloj.
 */
export function buildDay(acts: Activity[], nowMin: number): DayEntry[] {
  return acts.map((activity) => {
    const start = activity.start_time ? toMin(activity.start_time) : null
    const rawEnd = activity.end_time ? toMin(activity.end_time) : null
    // Un fin anterior al inicio significa que cruza medianoche: se descarta
    // antes que calcular una duración negativa y pintar una barra al revés.
    const end = rawEnd != null && start != null && rawEnd > start ? rawEnd : null

    let state: DayState = 'upcoming'
    if (activity.done) state = 'past'
    else if (start == null) state = 'upcoming'
    else if (end != null && start <= nowMin && nowMin <= end) state = 'current'
    else if ((end ?? start) < nowMin) state = 'past'

    let relative = ''
    let progress: number | null = null

    if (state === 'current' && start != null && end != null) {
      const left = formatDuration(end - nowMin)
      if (left) relative = `quedan ${left}`
      progress = Math.min(1, Math.max(0, (nowMin - start) / (end - start)))
    } else if (state === 'upcoming' && start != null && start > nowMin) {
      const until = formatDuration(start - nowMin)
      if (until) relative = `en ${until}`
    }

    return { activity, state, relative, progress }
  })
}

/**
 * La actividad que merece el sitio protagonista: la que está en curso; si no,
 * la siguiente; y si el día ya se acabó, la última. null si no hay nada.
 */
export function focusEntry(entries: DayEntry[]): DayEntry | null {
  return entries.find(e => e.state === 'current')
    ?? entries.find(e => e.state === 'upcoming')
    ?? entries[entries.length - 1]
    ?? null
}
