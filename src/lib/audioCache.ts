import { useEffect, useReducer, useRef } from 'react'
import { mediaUrl, mediaUrlOrThrow } from './mediaUrl'

// Los MP3 de las audioguías NO pueden cachearse en el service worker: interceptar
// las peticiones Range de un <audio> desde un SW es poco fiable en Safari/WebKit
// (por eso src/sw.ts excluye request.destination === 'audio'). Así que la caché la
// lleva la app con la Cache API y la reproducción va contra un blob: URL, donde el
// Range lo gestiona el navegador de forma nativa. Mismo patrón que src/lib/docCache.ts.
const CACHE_NAME = 'wanderlog-audio-v1'

// Bitrate del MP3 que devuelve Google TTS (MPEG-2 Layer III, 32 kbps): sirve para
// estimar el tamaño cuando el servidor no nos da el Content-Length.
const BYTES_PER_SECOND = 4000

/**
 * Lo guardado en `audio_url` → clave estable de caché.
 *
 * Las TRES formas que puede tener ese valor dan la MISMA clave, y eso no es un
 * detalle: es lo que permitió mudar los MP3 de Supabase a R2 sin que a nadie se
 * le vaciara la caché ni volviera a bajarse los viajes que tenía descargados.
 *
 *   https://xyz.supabase.co/storage/v1/object/public/audioguides/u/t/a/s.mp3
 *   https://pub-abc.r2.dev/u/t/a/s.mp3
 *   u/t/a/s.mp3
 *                        → todas /__audio__/u/t/a/s.mp3
 *
 * Se apoya en que la clave en R2 se dejó idéntica a la ruta que tenía en el
 * bucket de Supabase. Si algún día se remapean las claves, aquí hay que decidir
 * qué hacer con lo que la gente ya tiene descargado.
 */
function cacheKey(v: string): string {
  const path = v
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audioguides\//, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .split('?')[0]
  return `/__audio__/${path}`
}

async function openCache(): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null
  try { return await caches.open(CACHE_NAME) } catch { return null }
}

// A partir de aquí, `v` es SIEMPRE el valor crudo de `audio_url` tal y como
// está en la fila: una clave de R2 o una URL absoluta de las antiguas. Nunca
// una URL ya resuelta. La resolución para la red se hace aquí dentro, con
// mediaUrl(), para que los llamantes no tengan que acordarse.

export async function getAudio(v: string): Promise<Blob | null> {
  const cache = await openCache()
  const hit = await cache?.match(cacheKey(v))
  return hit ? await hit.blob() : null
}

export async function hasAudio(v: string): Promise<boolean> {
  const cache = await openCache()
  return !!(await cache?.match(cacheKey(v)))
}

/**
 * Con qué identificar la versión de un fichero. De una respuesta de otro
 * dominio el navegador solo deja leer las cabeceras seguras, y `etag` no está
 * entre ellas: last-modified y content-length sí, y bastan para saber si el MP3
 * se ha regenerado (al regenerar una parada se sube al mismo path).
 */
function version(headers: Headers): string {
  return [headers.get('last-modified'), headers.get('content-length')].filter(Boolean).join('|')
}

/** Descarga el MP3 a la caché local. Devuelve los bytes guardados (0 si ya estaba). */
export async function cacheAudio(v: string): Promise<number> {
  const cache = await openCache()
  if (!cache) return 0
  if (await cache.match(cacheKey(v))) return 0
  const res = await fetch(mediaUrlOrThrow(v))
  if (!res.ok) throw new Error(`audio ${res.status}`)
  // Se guarda la respuesta entera, no solo el blob: sus cabeceras son las que
  // luego permiten comprobar si el audio ha cambiado sin volver a bajarlo.
  const blob = await res.clone().blob()
  await cache.put(cacheKey(v), res)
  return blob.size
}

/**
 * Mira si el audio descargado sigue siendo el bueno. Solo gasta una petición
 * HEAD (unos cientos de bytes); el MP3 únicamente se vuelve a bajar si de
 * verdad ha cambiado. Sin conexión, o si el servidor no contesta, se queda lo
 * que ya hay. Devuelve true si la copia local se ha renovado.
 */
export async function refreshAudioIfChanged(v: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  const cache = await openCache()
  const hit = await cache?.match(cacheKey(v))
  if (!cache || !hit) return false

  // Copias guardadas antes de que se guardaran las cabeceras: no hay con qué
  // comparar, y bajarlas otra vez «por si acaso» sería gastar datos a ciegas.
  const local = version(hit.headers)
  if (!local) return false

  const url = mediaUrl(v)
  if (!url) return false

  const head = await fetch(url, { method: 'HEAD' }).catch(() => null)
  if (!head?.ok || version(head.headers) === local) return false

  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return false
  await cache.put(cacheKey(v), res)
  return true
}

/** Libera el sitio de una audioguía borrada. */
export async function removeAudios(valores: string[]): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  await Promise.all(valores.map((v) => cache.delete(cacheKey(v)).catch(() => false)))
}

/**
 * Borra todos los audios descargados de un viaje. Va por la ruta guardada
 * (`usuario/viaje/actividad/parada.mp3`) en vez de por una lista de URLs: en un
 * viaje con cientos de paradas esa lista no cabía en localStorage.
 */
export async function removeTripAudios(tripId: string): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  const keys = await cache.keys().catch(() => [])
  await Promise.all(keys
    .filter((req) => req.url.includes(`/${tripId}/`))
    .map((req) => cache.delete(req).catch(() => false)))
}

/** Se llama al cerrar sesión, igual que con los documentos. */
export async function clearAudioCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  await caches.delete(CACHE_NAME).catch(() => {})
}

/**
 * Lo que ocupa un audio: Content-Length real si el servidor contesta al HEAD,
 * y si no una estimación por duración (`exact: false`, para poder decir "unos").
 */
export async function audioSize(
  v: string,
  durationSeconds: number | null,
): Promise<{ bytes: number; exact: boolean }> {
  const fallback = { bytes: Math.round((durationSeconds ?? 0) * BYTES_PER_SECOND), exact: false }
  try {
    const res = await fetch(mediaUrlOrThrow(v), { method: 'HEAD' })
    const len = Number(res.headers.get('content-length'))
    if (res.ok && len > 0) return { bytes: len, exact: true }
  } catch { /* sin conexión o CORS: nos vale la estimación */ }
  return fallback
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export interface AudioUrls {
  /**
   * URL reproducible YA resuelta, de forma síncrona, o null si todavía no lo
   * está. Sin await: ese es justo el sentido de este hook.
   */
  resolve: (url: string | null | undefined) => string | null
}

/**
 * URLs reproducibles para varias paradas a la vez: la que suena y sus vecinas.
 * Si la parada está descargada suena desde el móvil —ni un byte de MP3 por la
 * red— y si no, en streaming con la URL pública.
 *
 * POR QUÉ RESUELVE VARIAS Y NO SOLO LA ACTUAL:
 *
 * Resolver un audio es asíncrono (abrir la caché, buscar, sacar el blob). En
 * iOS eso llega tarde. Safari solo concede `play()` si la llamada sale en la
 * MISMA tarea que el gesto del usuario, y al pulsar «siguiente» en la pantalla
 * de bloqueo la cadena era: gesto → estado de React → render → efecto → await
 * a la caché → otro render → otro efecto → play(). Para entonces el permiso ha
 * caducado, `play()` se rechaza con NotAllowedError y —como el rechazo se
 * ignoraba— la audioguía se quedaba muda sin decir nada. Con la pantalla
 * bloqueada era peor: Safari congela el JS, la promesa no resolvía hasta
 * desbloquear, y de ahí el «no suena hasta que entro otra vez al iPhone».
 *
 * Adelantando la vecina mientras suena la actual, al pulsar ya está resuelta y
 * el gesto puede asignar el src y llamar a play() en el acto.
 */
export function useAudioUrls(urls: (string | null | undefined)[]): AudioUrls {
  // Se guarda `esBlob` en vez de deducirlo comparando con el valor de entrada:
  // desde que la fila trae una clave de R2 y no una URL, lo resuelto NUNCA es
  // igual a la entrada, y esa comparación decidía a quién revocar.
  const resueltas = useRef(new Map<string, { src: string; esBlob: boolean }>())
  const [, avisarDeCambio] = useReducer((n: number) => n + 1, 0)

  // Clave estable: el array llega nuevo en cada render, pero su contenido no.
  const clave = urls.filter((u): u is string => !!u).join('\n')

  useEffect(() => {
    const quiero = new Set(clave ? clave.split('\n') : [])
    let cancelado = false

    // Suelta las que se han salido de la ventana. Un blob: vivo retiene el MP3
    // entero en memoria, y una audioguía exhaustiva pasa de veinte paradas.
    // La que suena nunca se suelta: siempre está dentro de la ventana.
    for (const [v, resuelta] of resueltas.current) {
      if (quiero.has(v)) continue
      if (resuelta.esBlob) URL.revokeObjectURL(resuelta.src)
      resueltas.current.delete(v)
    }

    void (async () => {
      for (const v of quiero) {
        if (cancelado) return
        if (!resueltas.current.has(v)) {
          const blob = await getAudio(v).catch(() => null)
          if (cancelado) return
          // Sin copia local se reproduce en streaming contra el origen público.
          // `mediaUrl` puede devolver null si falta VITE_R2_PUBLIC_URL; en ese
          // caso no se guarda nada y `resolve` sigue devolviendo null, que es
          // lo que el reproductor ya sabe tratar como «todavía no está».
          const streaming = blob ? null : mediaUrl(v)
          if (blob) resueltas.current.set(v, { src: URL.createObjectURL(blob), esBlob: true })
          else if (streaming) resueltas.current.set(v, { src: streaming, esBlob: false })
          avisarDeCambio()
        }

        // Ya se puede reproducir. Solo entonces, y solo con cobertura, se mira
        // si el audio se regeneró desde que se descargó (una petición HEAD).
        const cambiado = await refreshAudioIfChanged(v).catch(() => false)
        if (cancelado || !cambiado) continue
        const fresco = await getAudio(v).catch(() => null)
        if (cancelado || !fresco) continue
        const anterior = resueltas.current.get(v)
        if (anterior?.esBlob) URL.revokeObjectURL(anterior.src)
        resueltas.current.set(v, { src: URL.createObjectURL(fresco), esBlob: true })
        avisarDeCambio()
      }
    })()

    return () => { cancelado = true }
  }, [clave])

  // Al desmontar se sueltan todas, incluida la que estuviera sonando.
  useEffect(() => {
    const mapa = resueltas.current
    return () => {
      for (const { src, esBlob } of mapa.values()) {
        if (esBlob) URL.revokeObjectURL(src)
      }
      mapa.clear()
    }
  }, [])

  return {
    resolve: (v) => (v ? resueltas.current.get(v)?.src ?? null : null),
  }
}
