import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// El bucket `documents` (DNIs, pasaportes, billetes) es privado: se lee con URLs
// firmadas. Una URL firmada NO se puede cachear en el service worker, porque la
// firma cambia en cada petición y siempre falla el match. Así que la caché de
// documentos la lleva la app, con la Cache API, indexada por el PATH del fichero
// (que sí es estable). Es lo que permite ver el pasaporte sin conexión.
const CACHE_NAME = 'wanderlog-docs-v1'
const cacheKey = (path: string) => `/__doc__/${path}`

// Las URLs públicas de antes (getPublicUrl) conviven con los paths nuevos hasta
// que se renueva la caché persistida de los clientes ya instalados.
const PUBLIC_DOC_URL = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/documents\//

/** URL pública antigua o path → siempre el path. */
export function toDocPath(value: string): string {
  return value.replace(PUBLIC_DOC_URL, '')
}

/** ¿Apunta al bucket privado? Los adjuntos (bucket público) no, y pasan tal cual. */
export function isDocRef(value: string): boolean {
  return PUBLIC_DOC_URL.test(value) || !/^https?:\/\//.test(value)
}

async function openCache(): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null
  try { return await caches.open(CACHE_NAME) } catch { return null }
}

export async function putDoc(path: string, blob: Blob): Promise<void> {
  const cache = await openCache()
  await cache?.put(cacheKey(path), new Response(blob)).catch(() => {})
}

export async function getDoc(path: string): Promise<Blob | null> {
  const cache = await openCache()
  const hit = await cache?.match(cacheKey(path))
  return hit ? await hit.blob() : null
}

/** Se llama al cerrar sesión: los DNIs no se quedan en el dispositivo. */
export async function clearDocCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  await caches.delete(CACHE_NAME).catch(() => {})
}

/** URL firmada (1 h) para leer un documento del bucket privado. */
export async function signDoc(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** Descarga el documento a la caché local, para poder verlo sin conexión. */
export async function cacheDoc(value: string): Promise<void> {
  const path = toDocPath(value)
  if (await getDoc(path)) return
  const url = await signDoc(path).catch(() => null)
  if (!url) return
  const res = await fetch(url)
  if (res.ok) await putDoc(path, await res.blob())
}

/**
 * Resuelve el valor guardado en la BD a una URL que se puede pintar:
 * caché local (funciona sin conexión) → URL firmada. Los adjuntos del bucket
 * público se devuelven tal cual, de forma síncrona.
 */
export function useDocUrl(value: string | null | undefined): string | null {
  // Guardamos junto al resultado el valor que lo originó: así nunca pintamos la
  // URL del documento anterior mientras se resuelve el nuevo.
  const [resolved, setResolved] = useState<{ src: string; url: string } | null>(null)

  useEffect(() => {
    if (!value || !isDocRef(value)) return

    let objectUrl: string | null = null
    let cancelled = false

    void (async () => {
      const path = toDocPath(value)
      const blob = await getDoc(path).catch(() => null)
      if (cancelled) return

      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setResolved({ src: value, url: objectUrl })
        return
      }
      const signed = await signDoc(path).catch(() => null)
      if (!cancelled && signed) setResolved({ src: value, url: signed })
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [value])

  if (!value) return null
  if (!isDocRef(value)) return value
  return resolved?.src === value ? resolved.url : null
}
