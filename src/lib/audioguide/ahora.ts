import type { AudioguideScope } from './scope'
import type { TripAudioguideReadiness } from '@/lib/queries/audioguides'
import type { DayEntry } from '@/lib/today'
import type { ItineraryDay } from '@/types/database'

export interface AudioguiaDeAhora {
  scope: AudioguideScope
  titulo: string
  pie: string
}

/**
 * Qué audioguía toca escuchar ahora mismo, para ofrecerla desde el resumen del
 * día. La regla es deliberadamente predecible:
 *
 *   1. Si lo que tienes ahora (o lo siguiente) tiene audioguía propia, esa.
 *   2. Si no, la de la ciudad del día.
 *   3. Si no hay ninguna GENERADA, null.
 *
 * El paso 3 importa: en mitad de un viaje, un enlace que lleva a una pantalla
 * de «genera esto» es ruido. Aquí solo se ofrece lo que se puede escuchar ya,
 * y por eso se mira la lista de las que están listas y no la de las que existen.
 */
export function audioguiaDeAhora(
  readiness: TripAudioguideReadiness | string[] | undefined,
  focus: DayEntry | null,
  todayDay: ItineraryDay | undefined,
): AudioguiaDeAhora | null {
  // Array suelto = forma vieja del valor cacheado en localStorage (solo
  // actividades, de antes de que las audioguías pudieran ser de un día).
  const listas = Array.isArray(readiness)
    ? { activityIds: readiness, dayIds: [] as string[] }
    : { activityIds: readiness?.activityIds ?? [], dayIds: readiness?.dayIds ?? [] }

  const actividad = focus?.activity
  if (actividad && listas.activityIds.includes(actividad.id)) {
    return {
      scope: { kind: 'activity', id: actividad.id },
      titulo: actividad.title,
      // focusEntry ya calcula el "quedan 1 h 30" / "en 45 min": mejor pie que
      // cualquier texto fijo, y cambia solo con el reloj.
      pie: focus.relative || (focus.state === 'current' ? 'Ahora mismo' : 'A continuación'),
    }
  }

  if (todayDay && listas.dayIds.includes(todayDay.id)) {
    return {
      scope: { kind: 'day', id: todayDay.id },
      titulo: 'La ciudad de hoy',
      pie: 'Historia y curiosidades del sitio donde estás',
    }
  }

  return null
}
