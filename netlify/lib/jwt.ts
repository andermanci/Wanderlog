// Verificación del JWT de Supabase EN EL EDGE, sin tocar la base de datos.
//
// Por qué hace falta: la visita tiene que poder atribuirse a quien la hizo, y
// las tres formas de conseguirlo no valen lo mismo.
//
//   (a) Que el cliente mande su user_id en el cuerpo. Coste cero, y falla en
//       lo único que importa: cualquiera con curl fabricaría visitas
//       atribuidas a otra persona. Y ese campo alimenta la ficha con la que se
//       decide si suspender a alguien. Descartada.
//   (b) Mandar el JWT y comprobar la FIRMA aquí. Es lo que se hace.
//   (c) Reenviar el JWT a PostgREST y dejar que RLS ponga auth.uid(). Obliga a
//       dar insert al rol `anon` —cuya clave está impresa en el bundle— y
//       contradice el diseño de «tabla sin políticas». Descartada.
//
// EL RIESGO QUE SE ASUME con (b): alguien autenticado puede inflar SUS PROPIAS
// visitas. Eso no lo evita ninguna telemetría web. Lo que no puede es atribuir
// una visita a otra persona, que es lo que hacía peligrosa la (a).
//
// El token viaja en el CUERPO de un POST y nunca en la query string: una query
// acabaría escrita en los logs de acceso del CDN.
//
// ESTE PROYECTO FIRMA CON ES256 (comprobado sobre un token de sesión real) y
// publica su clave pública en el JWKS. Eso significa que **no hace falta
// ningún secreto**: la verificación usa una clave pública que cualquiera puede
// descargar, así que no hay nada que filtrar aunque el código sea legible. El
// respaldo con HS256 se conserva por si el proyecto vuelve a claves
// simétricas; entonces sí haría falta SUPABASE_JWT_SECRET.

import { jwtVerify, decodeProtectedHeader, createRemoteJWKSet } from 'https://esm.sh/jose@5?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO_HS = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''

// El JWKS se cachea EN EL ISOLATE: una petición por arranque en frío, no una
// por visita. `createRemoteJWKSet` además refresca solo cuando aparece un
// `kid` desconocido, así que una rotación de claves no rompe nada.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
const clavePublica = () =>
  (jwks ??= createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)))

/**
 * El `sub` del token, o null. Nunca lanza y nunca toca la base de datos.
 * Un token caducado, manipulado o ausente simplemente hace la visita anónima.
 */
export async function usuarioDeToken(token: string | null): Promise<string | null> {
  if (!token || token.length > 4000) return null
  try {
    const { alg } = decodeProtectedHeader(token)
    if (!alg) return null

    const clave = alg === 'HS256'
      ? new TextEncoder().encode(SECRETO_HS)
      : clavePublica()
    if (alg === 'HS256' && !SECRETO_HS) return null

    const { payload } = await jwtVerify(token, clave as never, { algorithms: [alg] })
    // `aud` distingue una sesión de persona de la anon key, que también es un
    // JWT válido y firmado: sin esta comprobación, cualquiera podría mandar la
    // anon key del bundle y quedarse con su `sub`.
    if (payload.aud !== 'authenticated') return null
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
