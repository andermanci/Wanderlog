// Lectura agregada de las visitas, para el panel de administración.
//
// POR QUÉ NO SE LEE `page_views` DESDE EL NAVEGADOR: bajar 50.000 filas son
// unos 5 MB que, con el `PersistQueryClientProvider` de esta app, acabarían
// escritos en el localStorage del administrador durante 60 días. Es decir: la
// analítica de todos los usuarios de la plataforma, guardada en un dispositivo
// y fuera de todo control. Aquí se agrega en el servidor y bajan ~50 KB.
//
// (El persister ya excluye las claves ['admin', …], pero eso es una defensa;
// no bajar los datos en primer lugar es el diseño.)

import { resumirVistas } from '../../src/lib/analytics/aggregate.ts'
import { usuarioDeToken } from '../lib/jwt.ts'
import { readPageViews, esAdmin, hayBD } from '../lib/db.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export default async function handler(req: Request): Promise<Response> {
  if (!hayBD()) return json({ error: 'sin_bd' }, 400)

  // Aquí el token SÍ va en la cabecera: no es un beacon, es un fetch normal.
  const auth = req.headers.get('authorization') ?? ''
  const userId = await usuarioDeToken(auth.replace(/^Bearer\s+/i, '') || null)
  if (!userId) return json({ error: 'sin_sesion' }, 401)

  // 404 y no 403, igual que el resto del panel: a quien no le corresponde no
  // se le confirma siquiera que esto exista.
  if (!(await esAdmin(userId))) return json({ error: 'no_encontrado' }, 404)

  // El clamp va en el servidor: `?dias=100000` sería leer la tabla entera.
  const pedido = Number(new URL(req.url).searchParams.get('dias') ?? 30)
  const dias = Math.min(Math.max(Number.isFinite(pedido) ? pedido : 30, 1), 90)

  try {
    const { filas, truncado } = await readPageViews(dias)
    return json(resumirVistas(filas, { dias, truncado }))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 502)
  }
}
