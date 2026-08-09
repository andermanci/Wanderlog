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

/** Descarga el MP3 a la caché local. Devuelve los bytes guardados (0 si ya estaba). */
export async function cacheAudio(url: string): Promise<number> {
  const cache = await openCache()
  if (!cache) return 0
  if (await cache.match(cacheKey(url))) return 0
  const res = await fetch(url)
  if (!res.ok) throw new Error(`audio ${res.status}`)
  const blob = await res.blob()
  await cache.put(cacheKey(url), new Response(blob))
  return blob.size
}

/** Libera el sitio de una audioguía borrada. */
export async function removeAudios(urls: string[]): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  await Promise.all(urls.map((u) => cache.delete(cacheKey(u)).catch(() => false)))
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
 * URL reproducible para un audio: blob: local si está descargado (funciona sin
 * conexión y con seek), y si no la URL pública de siempre.
 */
export function useAudioUrl(url: string | null | undefined): string | null {
  // Guardamos junto al resultado el valor que lo originó, para no reproducir
  // nunca el audio de la parada anterior mientras se resuelve el nuevo.
  const [resolved, setResolved] = useState<{ src: string; url: string } | null>(null)

  useEffect(() => {
    if (!url) return

    let objectUrl: string | null = null
    let cancelled = false

    void (async () => {
      const blob = await getAudio(url).catch(() => null)
      if (cancelled) return
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setResolved({ src: url, url: objectUrl })
      } else {
        setResolved({ src: url, url })
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  if (!url) return null
  return resolved?.src === url ? resolved.url : null
}
