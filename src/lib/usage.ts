import { supabase } from '@/lib/supabase'

// Telemetría de producto, lado cliente. Dos reglas y ninguna más:
//
//   1. NUNCA devuelve una promesa que alguien pueda `await` por error. Un
//      await accidental dentro de un `onSuccess` metería la latencia de la red
//      en el camino del usuario, que es justo lo que no puede pasar por medir.
//
//   2. Se traga TODOS los errores, incluido estar sin conexión. Y NO se encola
//      en el outbox offline a propósito: un evento que se sube tres días
//      después ensucia la serie temporal más de lo que aporta.
//
// Aquí solo van los hechos que NO dejan huella en la base ni pasan por ningún
// servidor. Todo lo que se corresponde con una fila lo emite un trigger
// (migración 052), y todo lo que cuesta dinero lo emite la edge function que
// lo gasta: esos números no se pueden dejar en manos del navegador.

/**
 * Lista cerrada. Es lo que impide acabar con `trip_downloaded`,
 * `tripDownloaded` y `trip.downloaded` en la misma tabla y ninguna gráfica
 * cuadrando.
 */
export const EVENTOS = [
  'trip.offline_downloaded',
  'trip.offline_deleted',
  'ics.imported',
  'pwa.installed',
  'push.subscribed',
  'audioguide.played',
] as const

export type EventoUso = typeof EVENTOS[number]

const MAX_CLAVES = 10
const MAX_TEXTO = 64

/**
 * Recorta las props. Puro y con test: sin esto, cualquiera acaba metiendo el
 * objeto entero de un documento en `props` y la tabla engorda sin que nadie lo
 * note hasta que la base se queda sin espacio.
 */
export function recortarProps(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p).slice(0, MAX_CLAVES)) {
    if (typeof v === 'string') out[k] = v.slice(0, MAX_TEXTO)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean' || v === null) out[k] = v
    // Objetos y arrays fuera: si hace falta anidar, es que el evento está mal
    // planteado y lo que quieres son dos eventos.
  }
  return out
}

/** Emite un evento. Nunca lanza, nunca bloquea, nunca devuelve nada. */
export function emitirUso(
  event: EventoUso,
  props: Record<string, unknown> = {},
  tripId?: string,
): void {
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      await supabase.from('usage_events').insert({
        user_id: session.user.id,
        trip_id: tripId ?? null,
        event,
        props: recortarProps(props),
        source: 'web',
      })
    } catch {
      /* la telemetría nunca rompe la acción del usuario */
    }
  })()
}
