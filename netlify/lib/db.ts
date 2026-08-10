// Escritura y lectura de `page_views` desde el edge, con el service_role.
//
// La tabla tiene RLS sin políticas: este es el único sitio del sistema que
// puede tocarla.

import type { Evento } from '../../src/lib/analytics/track.ts'
import type { Geo } from '../../src/lib/analytics/geo.ts'
import type { VistaCruda } from '../../src/lib/analytics/aggregate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export const hayBD = () => !!SUPABASE_URL && !!SERVICE_KEY

const cabeceras = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
})

/**
 * Escribe la vista. DOS escrituras acaban en la misma fila:
 *
 *   · apertura → `ignoreDuplicates`, para no pisar un cierre que llegó antes
 *     (pasa de verdad al recargar la página),
 *   · cierre   → upsert normal que sobrescribe. Es idempotente porque `ms`
 *     solo crece, así que puede mandarse tantas veces como haga falta.
 *
 * Nótese que NO recibe el token: `parseEvento` lo devuelve aparte justamente
 * para que sea imposible que un JWT acabe en una columna por descuido.
 */
export async function writePageView(
  e: Evento,
  extra: { userId: string | null; geo: Geo },
): Promise<void> {
  const fila: Record<string, unknown> = {
    id: e.id,
    session_id: e.sessionId,
    user_id: extra.userId,
    path: e.path,
    section: e.section,
    referrer_host: e.referrerHost,
    utm_source: e.utmSource,
    utm_medium: e.utmMedium,
    utm_campaign: e.utmCampaign,
    device: e.device,
    country: extra.geo.country,
    region: extra.geo.region,
    // `ms` solo va en el cierre: en la apertura todavía no se sabe, y mandar
    // 0 sería mentir.
    ...(e.cierre ? { ms: e.ms } : {}),
  }

  const escribir = async (f: Record<string, unknown>) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/page_views?on_conflict=id`, {
      method: 'POST',
      headers: cabeceras({
        Prefer: e.cierre
          ? 'resolution=merge-duplicates,return=minimal'
          : 'resolution=ignore-duplicates,return=minimal',
      }),
      body: JSON.stringify(f),
    })
    return res.ok ? null : await res.text()
  }

  const error = await escribir(fila)
  if (!error) return

  // PUENTE PARA LA VENTANA ENTRE EL DESPLIEGUE Y LA MIGRACIÓN.
  //
  // Netlify despliega en cuanto se hace push, pero las migraciones se aplican
  // a mano: el código que escribe una columna puede llegar antes que la
  // columna. Sin esto el insert falla ENTERO —no solo esa columna— y como el
  // endpoint se traga los errores para responder 204 siempre, la analítica
  // dejaría de grabar EN SILENCIO, que es el peor fallo posible aquí.
  const columna = /'?([a-z_]+)'? column|column "?([a-z_]+)"?/i.exec(error)?.slice(1).find(Boolean)
  if (columna && columna in fila) {
    const { [columna]: _fuera, ...sinLaColumna } = fila
    const reintento = await escribir(sinLaColumna)
    if (!reintento) return
  }

  // Nunca se lanza: quien llama responde 204 igualmente. Pero se deja escrito
  // en los logs de Netlify, que es donde se mira cuando el panel dice que la
  // última visita fue hace dos días.
  console.warn('[track] no se pudo escribir la vista:', error)
}

/** La API REST de Supabase devuelve 1000 filas como máximo por petición. */
const PAGINA = 1000
/** Tope de lectura. 50.000 filas son ~5 MB de JSON: más no cabe en memoria
 *  del edge ni tiene sentido agregar en caliente. */
const TOPE = 50_000

const CAMPOS = 'session_id,user_id,path,section,referrer_host,utm_source,device,country,region,ms,at'

interface FilaBD {
  session_id: string
  user_id: string | null
  path: string
  section: string
  referrer_host: string | null
  utm_source: string | null
  device: string
  country: string | null
  region: string | null
  ms: number | null
  at: string
}

/**
 * Las vistas de los últimos N días.
 *
 * OJO CON LA PAGINACIÓN, que es la trampa de esta tabla: PostgREST corta a
 * 1000 filas EN SILENCIO. Sin el bucle, en cuanto hubiera más de 1000 vistas
 * en la ventana el panel se quedaría clavado en 1000 para siempre, con unas
 * cifras perfectamente plausibles. De ahí también el flag `truncado`, que el
 * panel tiene que AVISAR en pantalla, no callarse.
 */
export async function readPageViews(
  dias: number,
): Promise<{ filas: VistaCruda[]; truncado: boolean }> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const filas: VistaCruda[] = []

  for (let inicio = 0; inicio < TOPE; inicio += PAGINA) {
    // `limit`/`offset` como parámetros y NO la cabecera `Range`: comprobado
    // contra este proyecto, PostgREST IGNORA `Range` sin `Range-Unit: items`
    // y devuelve la respuesta entera. Con la cabecera, el bucle daba siempre
    // la misma página y el «truncado» no se habría detectado jamás — o sea,
    // exactamente el fallo silencioso que toda esta función existe para evitar.
    //
    // `desde` va codificado: es un valor dentro de una query string, y aunque
    // `toISOString()` acabe en «Z» y hoy no traiga ningún «+», depender de eso
    // es depender de un detalle del formato.
    const url = `${SUPABASE_URL}/rest/v1/page_views`
      + `?select=${CAMPOS}`
      + `&at=gte.${encodeURIComponent(desde)}`
      + `&order=at.asc&limit=${PAGINA}&offset=${inicio}`
    const res = await fetch(url, { headers: cabeceras() })
    if (!res.ok) throw new Error(`Supabase: ${await res.text()}`)

    const pagina = (await res.json()) as FilaBD[]
    for (const r of pagina) {
      filas.push({
        sessionId: r.session_id,
        userId: r.user_id,
        path: r.path,
        section: r.section,
        referrerHost: r.referrer_host,
        utmSource: r.utm_source,
        device: r.device,
        country: r.country,
        region: r.region,
        ms: r.ms,
        at: r.at,
      })
    }
    // Página incompleta = no hay más.
    if (pagina.length < PAGINA) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

/** ¿Este usuario administra la plataforma? Una lectura, no es ruta caliente. */
export async function esAdmin(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_admins?select=user_id&user_id=eq.${userId}`,
    { headers: cabeceras() },
  )
  if (!res.ok) return false
  return ((await res.json()) as unknown[]).length > 0
}
