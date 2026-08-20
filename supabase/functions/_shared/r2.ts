// Cliente mínimo de Cloudflare R2 (API S3) para las Edge Functions.
//
// POR QUÉ R2 Y NO SUPABASE STORAGE: los MP3 de las audioguías son lo único que
// crece sin techo (32 kbps ≈ 240 KB por minuto de guion, y una audioguía de
// museo pasa de 7 MB), y se comieron el gigabyte del plan gratuito de Supabase.
// R2 da 10 GB y, sobre todo, no cobra por salida de datos, que en algo que se
// dedica a servir audio es lo que decide.
//
// POR QUÉ aws4fetch Y NO @aws-sdk/client-s3: el SDK de AWS son megabytes de
// bundle y shims de Node para usar el 2 % de su superficie, y en Deno se nota
// en el arranque en frío. aws4fetch son 4 KB sin dependencias, escrito para
// runtimes de edge, y es literalmente un envoltorio de fetch — el mismo estilo
// que el resto de funciones de este proyecto. La versión va clavada a
// propósito: un import por URL sin fijar es una dependencia que cambia sola.
//
// Este módulo NO lee Deno.env: recibe la configuración. Así lo puede usar tal
// cual el script de scripts/migrar-audio-r2.ts, y la firma SigV4 —que es donde
// aparecen los errores raros— se ejercita por los dos caminos en vez de estar
// duplicada.

import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

export interface ConfigR2 {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /**
   * Jurisdicción del bucket ('eu' para los creados con jurisdicción europea).
   *
   * ESTO NO ES OPCIONAL SI EL BUCKET LA TIENE, y cuesta horas descubrirlo: un
   * bucket con jurisdicción vive en `<cuenta>.eu.r2.cloudflarestorage.com`, y
   * pedirlo en el endpoint normal responde 403 AccessDenied — el mismo error,
   * exactamente, que da un secreto incorrecto. Se pierde el tiempo revisando
   * credenciales que están bien. Si el panel de Cloudflare enseña el bucket
   * como «nombre | EU», esto tiene que valer 'eu'.
   */
  jurisdiction?: string
}

export interface R2 {
  cliente: AwsClient
  /** Endpoint del bucket, sin barra final. */
  base: string
  bucket: string
}

export function clienteR2(cfg: ConfigR2): R2 {
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error('Configuración de R2 incompleta (accountId, accessKeyId, secretAccessKey, bucket)')
  }
  return {
    // `region: 'auto'` es lo que espera R2; con cualquier otra la firma no valida.
    cliente: new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: 's3',
      region: 'auto',
    }),
    base: `https://${cfg.accountId}${cfg.jurisdiction ? `.${cfg.jurisdiction}` : ''}.r2.cloudflarestorage.com/${cfg.bucket}`,
    bucket: cfg.bucket,
  }
}

/**
 * Clave → URL del objeto. Se codifica segmento a segmento: encodeURIComponent
 * sobre la clave entera escaparía las barras y acabaríamos con un solo objeto
 * de nombre kilométrico en vez de la jerarquía de carpetas.
 */
function urlDe(r2: R2, key: string): string {
  return `${r2.base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Sube (o sobrescribe) un objeto.
 *
 * `cacheControl` por defecto es corto A PROPÓSITO: al regenerar una parada se
 * sube sobre la MISMA clave, y el cliente detecta el cambio comparando
 * last-modified/content-length (src/lib/audioCache.ts). Con `immutable` o un
 * max-age largo, quien tuviera el audio viejo cacheado no vería nunca el nuevo.
 */
export async function r2Put(
  r2: R2,
  key: string,
  // `Uint8Array<ArrayBuffer>` y no `Uint8Array` a secas: el tipo general
  // admite también un SharedArrayBuffer por debajo, y ese no vale como cuerpo
  // de un fetch. Concretarlo aquí evita tener que colar un cast en la llamada.
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  cacheControl = 'public, max-age=300',
): Promise<void> {
  // No se pone content-length a mano: aws4fetch firma las cabeceras presentes
  // y una content-length añadida por nuestra cuenta descuadra la firma.
  const res = await r2.cliente.fetch(urlDe(r2, key), {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': contentType, 'cache-control': cacheControl },
  })
  if (!res.ok) {
    throw new Error(`R2 PUT ${key}: ${res.status} ${await res.text().catch(() => '')}`)
  }
}

/** Tamaño del objeto, o null si no existe. Es el punto de control del script. */
export async function r2Head(r2: R2, key: string): Promise<{ bytes: number } | null> {
  const res = await r2.cliente.fetch(urlDe(r2, key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 HEAD ${key}: ${res.status}`)
  return { bytes: Number(res.headers.get('content-length') ?? 0) }
}

/**
 * Borra objetos. Uno por petición en vez de con DeleteObjects por lotes: el
 * borrado en lote lleva cuerpo XML y Content-MD5, y a cambio ahorra unas
 * operaciones de clase A de las que sobran un millón al mes. No compensa.
 *
 * Devuelve qué falló en vez de lanzar: quien llama necesita poder decidir. En
 * este proyecto la regla es NO borrar la fila si el fichero no se ha podido
 * borrar — mejor una audioguía que sigue ahí que un huérfano permanente.
 */
export async function r2Delete(
  r2: R2,
  keys: string[],
  concurrencia = 8,
): Promise<{ borradas: number; fallos: string[] }> {
  let borradas = 0
  const fallos: string[] = []
  const pendientes = [...keys]

  const obrero = async () => {
    for (let key = pendientes.pop(); key !== undefined; key = pendientes.pop()) {
      try {
        const res = await r2.cliente.fetch(urlDe(r2, key), { method: 'DELETE' })
        // R2 devuelve 204 al borrar, y también si no existía: idempotente.
        if (res.ok || res.status === 404) borradas++
        else fallos.push(`${key}: ${res.status}`)
      } catch (err) {
        fallos.push(`${key}: ${err instanceof Error ? err.message : 'error'}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, keys.length) }, obrero))
  return { borradas, fallos }
}

/**
 * Todas las claves bajo un prefijo, siguiendo la paginación hasta el final.
 *
 * Se parsea el XML con una expresión regular en vez de con un parser: la única
 * respuesta que consumimos es ListObjectsV2, cuyo <Key> no lleva atributos ni
 * anidamiento. Meter un parser de XML por esto sería desproporcionado.
 */
export async function r2ListPrefix(r2: R2, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined

  do {
    const url = new URL(r2.base)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', prefix)
    url.searchParams.set('max-keys', '1000')
    if (token) url.searchParams.set('continuation-token', token)

    const res = await r2.cliente.fetch(url.toString())
    if (!res.ok) throw new Error(`R2 LIST ${prefix}: ${res.status}`)
    const xml = await res.text()

    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      keys.push(desescaparXml(m[1]))
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined
  } while (token)

  return keys
}

function desescaparXml(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

/** Lee la configuración del entorno. Solo para las Edge Functions. */
export function configR2DelEntorno(): ConfigR2 | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    accountId, accessKeyId, secretAccessKey, bucket,
    jurisdiction: Deno.env.get('R2_JURISDICTION') || undefined,
  }
}
