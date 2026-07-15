// Detección del código escaneable (QR, PDF417, Aztec, código de barras…) que va
// DENTRO del billete adjunto de una reserva. El código real no se puede
// reconstruir desde el localizador: solo existe en la imagen/PDF del billete.
// Aquí lo rasterizamos a un canvas, lo decodificamos con ZXing y recortamos su
// región para poder enseñarlo grande y nítido en el wallet. Si no se detecta
// nada, devolvemos null y la UI cae al billete completo (que sigue valiendo).
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library'
import * as pdfjsLib from 'pdfjs-dist'
// El worker se empaqueta como asset local (?url) para no depender de un CDN y
// funcionar también sin conexión (se precachea, ver globPatterns en vite.config).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface DetectedCode {
  /** Etiqueta legible del tipo, p. ej. "Código QR". */
  label: string
  /** Data URL (PNG) del recorte ampliado del código, listo para <img>. */
  cropDataUrl: string
}

// Formatos que buscamos: 2D (QR/Aztec/PDF417/DataMatrix) típicos de billetes y
// entradas, más los 1D habituales por si el billete lleva un código de barras.
const ONE_D = new Set<BarcodeFormat>([
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.ITF,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODABAR,
])

function formatLabel(format: BarcodeFormat): string {
  switch (format) {
    case BarcodeFormat.QR_CODE: return 'Código QR'
    case BarcodeFormat.AZTEC: return 'Aztec'
    case BarcodeFormat.PDF_417: return 'PDF417'
    case BarcodeFormat.DATA_MATRIX: return 'Data Matrix'
    default: return 'Código de barras'
  }
}

function buildReader(): MultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE, BarcodeFormat.AZTEC, BarcodeFormat.PDF_417,
    BarcodeFormat.DATA_MATRIX, ...ONE_D,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new MultiFormatReader()
  reader.setHints(hints)
  return reader
}

// Rasteriza el origen (imagen o PDF) a un canvas, capando el lado mayor para no
// disparar memoria/CPU con fotos enormes.
const MAX_SIDE = 2000

async function imageToCanvas(src: string): Promise<HTMLCanvasElement> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    // Necesario para poder leer el canvas (getImageData/toDataURL) sin taint.
    // Si el host no manda CORS, el load falla y caemos al fallback (billete entero).
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('img load failed'))
    el.src = src
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function pdfPageToCanvas(src: string, pageNum: number): Promise<HTMLCanvasElement | null> {
  const loadingTask = pdfjsLib.getDocument({ url: src })
  const doc = await loadingTask.promise
  try {
    if (pageNum > doc.numPages) return null
    const page = await doc.getPage(pageNum)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, MAX_SIDE / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas
  } finally {
    void loadingTask.destroy()
  }
}

// Recorta la región del código a partir de sus puntos y la agranda sobre fondo
// blanco (mejor lectura del escáner y contraste en modo oscuro).
function cropCode(
  canvas: HTMLCanvasElement,
  points: { getX(): number; getY(): number }[],
  is1D: boolean,
): string {
  const xs = points.map(p => p.getX())
  const ys = points.map(p => p.getY())
  let minX = Math.min(...xs), maxX = Math.max(...xs)
  let minY = Math.min(...ys), maxY = Math.max(...ys)

  // Margen alrededor del código (zona de silencio incluida).
  const padX = Math.max(canvas.width * 0.04, (maxX - minX) * 0.15, 12)
  const padY = Math.max(canvas.height * 0.04, (maxY - minY) * 0.15, 12)
  minX -= padX; maxX += padX; minY -= padY; maxY += padY

  // Los códigos 1D dan solo dos puntos en una línea: sin alto real. Le damos una
  // banda vertical para incluir las barras completas.
  if (is1D && maxY - minY < canvas.height * 0.12) {
    const cy = (minY + maxY) / 2
    const half = canvas.height * 0.14
    minY = cy - half; maxY = cy + half
  }

  minX = Math.max(0, Math.floor(minX)); minY = Math.max(0, Math.floor(minY))
  maxX = Math.min(canvas.width, Math.ceil(maxX)); maxY = Math.min(canvas.height, Math.ceil(maxY))
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY)

  // Escala el recorte a ~640px de lado mayor para que se vea grande y nítido.
  const target = 640
  const s = Math.min(3, target / Math.max(w, h))
  const out = document.createElement('canvas')
  out.width = Math.round(w * s)
  out.height = Math.round(h * s)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, minX, minY, w, h, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

function decodeCanvas(reader: MultiFormatReader, canvas: HTMLCanvasElement): DetectedCode | null {
  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    const result = reader.decode(bitmap)
    const format = result.getBarcodeFormat()
    const points = (result.getResultPoints() ?? []).filter(Boolean)
    const cropDataUrl = points.length >= 2
      ? cropCode(canvas, points, ONE_D.has(format))
      : canvas.toDataURL('image/png')
    return { label: formatLabel(format), cropDataUrl }
  } catch {
    // NotFoundException / ChecksumException / FormatException → no hay código.
    return null
  } finally {
    reader.reset()
  }
}

async function run(src: string, isPdf: boolean): Promise<DetectedCode | null> {
  const reader = buildReader()
  if (isPdf) {
    // El código suele ir en la 1ª página; probamos alguna más por si acaso.
    for (let page = 1; page <= 3; page++) {
      const canvas = await pdfPageToCanvas(src, page).catch(() => null)
      if (!canvas) break
      const found = decodeCanvas(reader, canvas)
      if (found) return found
    }
    return null
  }
  const canvas = await imageToCanvas(src)
  return decodeCanvas(reader, canvas)
}

// Caché por clave estable (el valor guardado en BD, no la URL firmada que cambia
// en cada petición). Evita re-decodificar el mismo billete al re-renderizar.
const cache = new Map<string, Promise<DetectedCode | null>>()

export function detectCode(cacheKey: string, src: string, isPdf: boolean): Promise<DetectedCode | null> {
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const promise = run(src, isPdf).catch(() => null)
  cache.set(cacheKey, promise)
  return promise
}
