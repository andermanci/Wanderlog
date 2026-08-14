import { useEffect, useReducer, useRef } from 'react'

// Los MP3 de las audioguías NO pueden cachearse en el service worker: interceptar
// las peticiones Range de un <audio> desde un SW es poco fiable en Safari/WebKit
// (por eso src/sw.ts excluye request.destination === 'audio'). Así que la caché la
// lleva la app con la Cache API y la reproducción va contra un blob: URL, donde el
// Range lo gestiona el navegador de forma nativa. Mismo patrón que src/lib/docCache.ts.
const CACHE_NAME = 'wanderlog-audio-v1'

// Bitrate del MP3 que devuelve Google TTS (MPEG-2 Layer III, 32 kbps): sirve para
// estimar el tamaño cuando el servidor no nos da el Content-Length.
const BYTES_PER_SECOND = 4000

/** URL pública → clave estable de caché (el path dentro del bucket, sin query). */
function cacheKey(url: string): string {
  const path = url
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audioguides\//, '')
    .split('?')[0]
  return `/__audio__/${path}`
}

async function openCache(): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null
  try { return await caches.open(CACHE_NAME) } catch { return null }
}

export async function getAudio(url: string): Promise<Blob | null> {
  const cache = await openCache()
  const hit = await cache?.match(cacheKey(url))
  return hit ? await hit.blob() : null
}

export async function hasAudio(url: string): Promise<boolean> {
  const cache = await openCache()
  return !!(await cache?.match(cacheKey(url)))
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
export async function cacheAudio(url: string): Promise<number> {
  const cache = await openCache()
  if (!cache) return 0
  if (await cache.match(cacheKey(url))) return 0
  const res = await fetch(url)
  if (!res.ok) throw new Error(`audio ${res.status}`)
  // Se guarda la respuesta entera, no solo el blob: sus cabeceras son las que
  // luego permiten comprobar si el audio ha cambiado sin volver a bajarlo.
  const blob = await res.clone().blob()
  await cache.put(cacheKey(url), res)
  return blob.size
}

/**
 * Mira si el audio descargado sigue siendo el bueno. Solo gasta una petición
 * HEAD (unos cientos de bytes); el MP3 únicamente se vuelve a bajar si de
 * verdad ha cambiado. Sin conexión, o si el servidor no contesta, se queda lo
 * que ya hay. Devuelve true si la copia local se ha renovado.
 */
export async function refreshAudioIfChanged(url: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  const cache = await openCache()
  const hit = await cache?.match(cacheKey(url))
  if (!cache || !hit) return false

  // Copias guardadas antes de que se guardaran las cabeceras: no hay con qué
  // comparar, y bajarlas otra vez «por si acaso» sería gastar datos a ciegas.
  const local = version(hit.headers)
  if (!local) return false

  const head = await fetch(url, { method: 'HEAD' }).catch(() => null)
  if (!head?.ok || version(head.headers) === local) return false

  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return false
  await cache.put(cacheKey(url), res)
  return true
}

/** Libera el sitio de una audioguía borrada. */
export async function removeAudios(urls: string[]): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  await Promise.all(urls.map((u) => cache.delete(cacheKey(u)).catch(() => false)))
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
  url: string,
  durationSeconds: number | null,
): Promise<{ bytes: number; exact: boolean }> {
  const fallback = { bytes: Math.round((durationSeconds ?? 0) * BYTES_PER_SECOND), exact: false }
  try {
    const res = await fetch(url, { method: 'HEAD' })
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
  const resueltas = useRef(new Map<string, string>())
  const [, avisarDeCambio] = useReducer((n: number) => n + 1, 0)

  // Clave estable: el array llega nuevo en cada render, pero su contenido no.
  const clave = urls.filter((u): u is string => !!u).join('\n')

  useEffect(() => {
    const quiero = new Set(clave ? clave.split('\n') : [])
    let cancelado = false

    // Suelta las que se han salido de la ventana. Un blob: vivo retiene el MP3
    // entero en memoria, y una audioguía exhaustiva pasa de veinte paradas.
    // La que suena nunca se suelta: siempre está dentro de la ventana.
    for (const [url, objectUrl] of resueltas.current) {
      if (quiero.has(url)) continue
      if (objectUrl !== url) URL.revokeObjectURL(objectUrl)
      resueltas.current.delete(url)
    }

    void (async () => {
      for (const url of quiero) {
        if (cancelado) return
        if (!resueltas.current.has(url)) {
          const blob = await getAudio(url).catch(() => null)
          if (cancelado) return
          resueltas.current.set(url, blob ? URL.createObjectURL(blob) : url)
          avisarDeCambio()
        }

        // Ya se puede reproducir. Solo entonces, y solo con cobertura, se mira
        // si el audio se regeneró desde que se descargó (una petición HEAD).
        const cambiado = await refreshAudioIfChanged(url).catch(() => false)
        if (cancelado || !cambiado) continue
        const fresco = await getAudio(url).catch(() => null)
        if (cancelado || !fresco) continue
        const anterior = resueltas.current.get(url)
        if (anterior && anterior !== url) URL.revokeObjectURL(anterior)
        resueltas.current.set(url, URL.createObjectURL(fresco))
        avisarDeCambio()
      }
    })()

    return () => { cancelado = true }
  }, [clave])

  // Al desmontar se sueltan todas, incluida la que estuviera sonando.
  useEffect(() => {
    const mapa = resueltas.current
    return () => {
      for (const [url, objectUrl] of mapa) {
        if (objectUrl !== url) URL.revokeObjectURL(objectUrl)
      }
      mapa.clear()
    }
  }, [])

  return {
    resolve: (url) => (url ? resueltas.current.get(url) ?? null : null),
  }
}
