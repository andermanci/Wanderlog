// Eventos de uso desde las edge functions.
//
// Aquí van los que CUESTAN DINERO: el número real (caracteres sintetizados,
// bytes descargados, llamadas a la API de un tercero) solo lo sabe el servidor
// que lo gastó. Dejarlo en manos del navegador sería medir lo que el navegador
// diga, y esa cifra es la que decide si hay que quitarle `can_use_ai` a
// alguien.
//
// Se escribe con el service_role: la política de `usage_events` solo permite
// insertar `user_id = auth.uid()`, y aquí no hay sesión de Postgres.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Emite un evento. NUNCA lanza y NUNCA se debe esperar con `await` en el
 * camino de la respuesta: si la telemetría se cae o va lenta, el usuario no
 * tiene por qué enterarse. Devuelve void a propósito.
 */
export function registrarUso(
  userId: string | null,
  tripId: string | null,
  event: string,
  props: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      if (!SUPABASE_URL || !SERVICE_KEY) return
      await fetch(`${SUPABASE_URL}/rest/v1/usage_events`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          user_id: userId,
          trip_id: tripId,
          event,
          props,
          source: 'edge',
        }),
      })
    } catch {
      /* la telemetría no rompe la función que la emite */
    }
  })()
}
