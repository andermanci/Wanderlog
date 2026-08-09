// Fotos para ver sin conexión. A diferencia de los audios y los documentos,
// aquí NO hace falta un hook ni tocar cada <img>: guardamos la copia en la misma
// caché que lee el service worker (con la URL original como clave), así que su
// ruta CacheFirst la sirve tal cual. Lo que cambia es que la copia se guarda
// reducida y en WebP, que ocupa una fracción del original.
//
// Nombres de caché: los de src/sw.ts, según de dónde venga la imagen.
const SUPABASE_CACHE = 'supabase-storage-v2'
const WIKI_CACHE = 'wiki-images'

const MAX_SIDE = 1280
const QUALITY = 0.6

function cacheNameFor(url: string): string | null {
  if (/\.supabase\.co\/storage\/v1\/object\/public\//.test(url)) return SUPABASE_CACHE
  if (/^https:\/\/upload\.wikimedia\.org\//.test(url)) return WIKI_CACHE
  return null
}

async function openCacheFor(url: string): Promise<Cache | null> {
  const name = cacheNameFor(url)
  if (!name || !('caches' in globalThis)) return null
  try { return await caches.open(name) } catch { return null }
}

// Los GIF perderían la animación y los SVG no se reescalan: van tal cual.
function isCompressible(blob: Blob): boolean {
  return /^image\/(jpeg|png|webp)$/.test(blob.type)
}

async function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/**
 * Reduce la foto a MAX_SIDE de lado mayor y la recodifica. Si el resultado no
 * es más pequeño que el original (fotos ya diminutas), se queda el original.
 */
export async function compressImage(blob: Blob): Promise<Blob> {
  if (!isCompressible(blob)) return blob
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(blob) } catch { return blob }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); return blob }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  // WebP donde se pueda; si el navegador no sabe codificarlo, JPEG.
  const out = (await toBlob(canvas, 'image/webp')) ?? (await toBlob(canvas, 'image/jpeg'))
  return out && out.size < blob.size ? out : blob
}

// Marca de "esta copia la hemos guardado nosotros, ya reducida". Sirve para no
// volver a descargar lo que ya está comprimido y, a la vez, para reemplazar los
// originales a tamaño completo que el service worker fue cacheando al navegar.
const MARK = 'x-wanderlog-photo'

/** Descarga la foto, la comprime y la deja lista para el SW. Devuelve los bytes guardados. */
export async function cachePhoto(url: string): Promise<number> {
  const cache = await openCacheFor(url)
  if (!cache) return 0
  const hit = await cache.match(url)
  if (hit?.headers.get(MARK) === '1') return 0
  const res = await fetch(url)
  if (!res.ok) throw new Error(`foto ${res.status}`)
  const original = await res.blob()
  const blob = await compressImage(original)
  await cache.put(url, new Response(blob, {
    headers: {
      'content-type': blob.type || 'image/webp',
      'content-length': String(blob.size),
      [MARK]: '1',
    },
  }))
  return blob.size
}

/**
 * Al cerrar sesión: las fotos del diario y los adjuntos son del usuario que se
 * va, igual que los documentos (ver clearDocCache).
 */
export async function clearPhotoCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  await caches.delete(SUPABASE_CACHE).catch(() => {})
}

export async function removePhotos(urls: string[]): Promise<void> {
  await Promise.all(urls.map(async (u) => {
    const cache = await openCacheFor(u)
    await cache?.delete(u).catch(() => false)
  }))
}

/** Lo que hay que descargarse para guardar estas fotos (el original, antes de comprimir). */
export async function photosSize(urls: string[]): Promise<{ bytes: number; exact: boolean }> {
  const sizes = await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      const len = Number(res.headers.get('content-length'))
      if (res.ok && len > 0) return len
    } catch { /* sin conexión o CORS */ }
    return null
  }))
  const known = sizes.filter((s): s is number => s !== null)
  // Para las que no contesten, la media de las que sí (mejor que ignorarlas).
  const average = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 0
  return {
    bytes: Math.round(known.reduce((a, b) => a + b, 0) + (sizes.length - known.length) * average),
    exact: known.length === sizes.length,
  }
}
