// Ingesta de visitas. La ruta más caliente del sitio: una escritura por
// pantalla y visitante.
//
// RESPONDE 204 PASE LO QUE PASE. No llena los logs, no provoca reintentos y no
// le dice a quien lo intente si su cuerpo coló. El precio es que un fallo aquí
// es invisible por diseño, y por eso existe el canario del GET (abajo) y el
// aviso de «última visita hace X» en el panel.
//
// Va en una edge function de NETLIFY y no en una de Supabase porque solo
// Netlify sabe desde dónde se conecta la visita (`context.geo`), y porque
// estando en el propio dominio no hay CORS ni preflight en la ruta que más se
// llama. Las declaraciones [[edge_functions]] se resuelven ANTES que los
// [[redirects]], así que la regla SPA `/* -> /index.html` no se come esto.

import { parseEvento, esBot, MAX_CUERPO } from '../../src/lib/analytics/track.ts'
import { geoDeContexto, geoDeCabeceras, type ContextoGeo } from '../../src/lib/analytics/geo.ts'
import { usuarioDeToken } from './_jwt.ts'
import { writePageView, hayBD } from './_db.ts'

interface Contexto {
  geo?: ContextoGeo
}

const SIN_CUERPO = { status: 204 }

export default async function handler(req: Request, context: Contexto): Promise<Response> {
  // Canario de despliegue. Sin esto, si la edge function no llega a
  // desplegarse, el redirect SPA devuelve index.html con 200 y el cliente
  // creería que todo va bien PARA SIEMPRE. Un curl tras cada despliegue lo
  // caza en un segundo.
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, v: 1 }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
  if (req.method !== 'POST') return new Response(null, SIN_CUERPO)

  try {
    if (!hayBD()) return new Response(null, SIN_CUERPO)

    // Los filtros van en orden de coste: lo que se descarta gratis, primero.
    const ua = req.headers.get('user-agent')
    if (esBot(ua)) return new Response(null, SIN_CUERPO)

    const declarado = Number(req.headers.get('content-length') ?? 0)
    if (declarado > MAX_CUERPO) return new Response(null, SIN_CUERPO)

    // Filtro de ruido, no defensa: `sec-fetch-site` lo pone el navegador y
    // cualquiera puede omitirlo. Sirve para que la tabla no se llene de
    // peticiones sueltas de otros sitios.
    const sitio = req.headers.get('sec-fetch-site')
    if (sitio && sitio !== 'same-origin' && sitio !== 'none') {
      return new Response(null, SIN_CUERPO)
    }

    const crudo = await req.text()
    // Se recomprueba sobre el texto leído: la cabecera content-length miente.
    if (crudo.length > MAX_CUERPO) return new Response(null, SIN_CUERPO)

    const propioHost = (() => {
      try { return new URL(req.url).hostname.toLowerCase() } catch { return null }
    })()

    const parsed = parseEvento(crudo, { userAgent: ua, propioHost })
    if (!parsed) return new Response(null, SIN_CUERPO)

    // `context.geo` es la fuente buena; las cabeceras son el respaldo y lo que
    // permite simular la geolocalización con `netlify dev --country=es`.
    const geoCtx = geoDeContexto(context?.geo)
    const geo = geoCtx.country || geoCtx.region
      ? geoCtx
      : geoDeCabeceras(n => req.headers.get(n))

    const userId = await usuarioDeToken(parsed.token)

    await writePageView(parsed.evento, { userId, geo })
    return new Response(null, SIN_CUERPO)
  } catch (e) {
    // Ni un error se escapa hacia el usuario. Al log sí, que es donde se mira.
    console.warn('[track] error:', e instanceof Error ? e.message : String(e))
    return new Response(null, SIN_CUERPO)
  }
}
