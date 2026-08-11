import { useEffect, useState } from 'react'

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

/**
 * URL reproducible para un audio. Si la parada está descargada suena desde el
 * móvil: ni un byte de MP3 por la red, con o sin cobertura. Lo único que se
 * consulta es si ese audio ha cambiado, y solo entonces se baja de nuevo. Lo
 * que no esté descargado se reproduce en streaming, como siempre.
 */
export function useAudioUrl(url: string | null | undefined): string | null {
  // Guardamos junto al resultado el valor que lo originó, para no reproducir
  // nunca el audio de la parada anterior mientras se resuelve el nuevo.
  const [resolved, setResolved] = useState<{ src: string; url: string } | null>(null)

  useEffect(() => {
    if (!url) return

    // Los blob: se liberan todos al final: soltar el anterior en cuanto llega
    // el nuevo dejaría al <audio> reproduciendo una URL ya revocada.
    const objectUrls: string[] = []
    let cancelled = false

    const play = (blob: Blob) => {
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.push(objectUrl)
      setResolved({ src: url, url: objectUrl })
    }

    void (async () => {
      const blob = await getAudio(url).catch(() => null)
      if (cancelled) return
      if (!blob) {
        setResolved({ src: url, url })
        return
      }
      play(blob)

      // Ya está sonando desde la copia local. Ahora, y solo si hay cobertura,
      // se comprueba si el audio se ha regenerado desde que se descargó.
      const changed = await refreshAudioIfChanged(url).catch(() => false)
      if (cancelled || !changed) return
      const fresh = await getAudio(url).catch(() => null)
      if (cancelled || !fresh) return
      play(fresh)
    })()

    return () => {
      cancelled = true
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [url])

  if (!url) return null
  return resolved?.src === url ? resolved.url : null
}
