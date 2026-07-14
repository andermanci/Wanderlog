// Recorte automático de documentos (DNI, pasaporte…) a partir de una foto.
// Usa OpenCV.js + jscanify, cargados de forma DIFERIDA desde CDN (solo cuando
// se usan, para no engordar el bundle). Si la detección falla, devuelve el
// archivo original: nunca deja al usuario sin poder subir la foto.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ambos scripts salen del mismo paquete en jsDelivr (inmutable y versionado):
// jscanify trae vendorizado el OpenCV contra el que está compilado. Las URLs de
// antes estaban MUERTAS —docs.opencv.org borró la 4.10 y jscanify no publica un
// dist/— así que las dos daban 404 y el recorte nunca llegaba a ejecutarse: el
// fallo se tragaba en ensureLibs() y siempre se subía la foto sin recortar.
//
// Van con SRI (integrity): es la página donde el usuario acaba de fotografiar su
// DNI, y un CDN comprometido podría inyectar JS justo ahí. Si algún día se sube
// de versión hay que recalcular los hashes:
//   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
const OPENCV_SRC = 'https://cdn.jsdelivr.net/npm/jscanify@1.2.0/src/opencv.js'
const OPENCV_SRI = 'sha384-7NgX/1nBIFcqsilWilRzcsVBOcPRmtwBvqsFS0QdyP6i356G43SIDx5JKd1aNqtz'
const JSCANIFY_SRC = 'https://cdn.jsdelivr.net/npm/jscanify@1.2.0/src/jscanify.js'
const JSCANIFY_SRI = 'sha384-7AgnUm6MIi86SO1PvPHKOGHJHQkijMHYk051Qg1oBGbHh8s9oKnRx0i6M1LDY3oO'

let libsPromise: Promise<boolean> | null = null

function loadScript(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.integrity = integrity
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    document.head.appendChild(s)
  })
}

// Carga OpenCV + jscanify y espera a que OpenCV esté inicializado.
function ensureLibs(): Promise<boolean> {
  if (libsPromise) return libsPromise
  libsPromise = (async () => {
    await loadScript(OPENCV_SRC, OPENCV_SRI)
    // OpenCV.js inicializa su runtime de WASM de forma asíncrona.
    await new Promise<void>((resolve, reject) => {
      const start = Date.now()
      const tick = () => {
        const cv = (window as any).cv
        if (cv && cv.Mat) return resolve()
        if (cv && typeof cv.then === 'function') { cv.then(() => resolve()); return }
        if (Date.now() - start > 20000) return reject(new Error('OpenCV timeout'))
        setTimeout(tick, 120)
      }
      tick()
    })
    await loadScript(JSCANIFY_SRC, JSCANIFY_SRI)
    return !!(window as any).jscanify
  })().catch(() => false)
  return libsPromise
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen inválida')) }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Detecta el documento en la foto y devuelve una imagen recortada y enderezada.
 * Devuelve `null` si no se pudo recortar (el llamador usa el original).
 */
export async function cropDocument(file: File): Promise<Blob | null> {
  // Solo imágenes; los PDF u otros se suben tal cual.
  if (!file.type.startsWith('image/')) return null
  try {
    const ok = await ensureLibs()
    if (!ok) return null
    const cv = (window as any).cv
    const Jscanify = (window as any).jscanify
    if (!cv || !Jscanify) return null

    const img = await fileToImage(file)
    const scanner = new Jscanify()
    const mat = cv.imread(img)
    const contour = scanner.findPaperContour(mat)
    if (!contour) { mat.delete?.(); return null }

    const c = scanner.getCornerPoints(contour)
    const corners = [c?.topLeftCorner, c?.topRightCorner, c?.bottomRightCorner, c?.bottomLeftCorner]
    if (corners.some((p) => !p || typeof p.x !== 'number')) { mat.delete?.(); return null }

    // Dimensiones de salida desde el cuadrilátero detectado (conserva proporción).
    const w = Math.round(Math.max(dist(c.topLeftCorner, c.topRightCorner), dist(c.bottomLeftCorner, c.bottomRightCorner)))
    const h = Math.round(Math.max(dist(c.topLeftCorner, c.bottomLeftCorner), dist(c.topRightCorner, c.bottomRightCorner)))
    if (w < 120 || h < 80) { mat.delete?.(); return null } // detección dudosa

    const resultCanvas: HTMLCanvasElement = scanner.extractPaper(img, w, h, c)
    mat.delete?.()
    URL.revokeObjectURL(img.src)
    return await canvasToBlob(resultCanvas)
  } catch {
    return null
  }
}
