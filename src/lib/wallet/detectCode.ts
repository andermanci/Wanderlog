// Detección de los códigos escaneables (QR, PDF417, Aztec, código de barras…)
// que van DENTRO del billete adjunto de una reserva. El código real no se puede
// reconstruir desde el localizador: solo existe en la imagen/PDF del billete.
// Aquí lo rasterizamos a un canvas, lo decodificamos con ZXing y recortamos su
// región para poder enseñarlo grande y nítido en el wallet. Un mismo billete
// puede llevar VARIOS códigos (p. ej. un pase por viajero): tras leer uno,
// tapamos su región de blanco y volvemos a decodificar para encontrar los demás.
// Si no se detecta nada, devolvemos [] y la UI cae al billete completo.
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

// Tras leer un código, pintamos de blanco su región (con margen) para que la
// siguiente decodificación encuentre otro distinto y no el mismo en bucle.
function maskRegion(
  canvas: HTMLCanvasElement,
  points: { getX(): number; getY(): number }[],
  is1D: boolean,
): void {
  const xs = points.map(p => p.getX())
  const ys = points.map(p => p.getY())
  let minX = Math.min(...xs), maxX = Math.max(...xs)
  let minY = Math.min(...ys), maxY = Math.max(...ys)
  const padX = Math.max((maxX - minX) * 0.3, canvas.width * 0.03, 16)
  const padY = Math.max((maxY - minY) * 0.3, canvas.height * 0.03, 16)
  minX -= padX; maxX += padX; minY -= padY; maxY += padY
  if (is1D && maxY - minY < canvas.height * 0.12) {
    const cy = (minY + maxY) / 2, half = canvas.height * 0.14
    minY = cy - half; maxY = cy + half
  }
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
}

// Decodifica UN código del canvas. Recorta su región para enseñarlo y, si tiene
// puntos suficientes, la enmascara para la siguiente pasada. `masked` indica si
// se pudo tapar (si no, no tiene sentido reintentar sobre el mismo canvas).
function decodeCanvas(
  reader: MultiFormatReader,
  canvas: HTMLCanvasElement,
): { code: DetectedCode; masked: boolean } | null {
  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    const result = reader.decode(bitmap)
    const format = result.getBarcodeFormat()
    const points = (result.getResultPoints() ?? []).filter(Boolean)
    const is1D = ONE_D.has(format)
    const hasRegion = points.length >= 2
    const cropDataUrl = hasRegion ? cropCode(canvas, points, is1D) : canvas.toDataURL('image/png')
    if (hasRegion) maskRegion(canvas, points, is1D)
    return { code: { label: formatLabel(format), cropDataUrl }, masked: hasRegion }
  } catch {
    // NotFoundException / ChecksumException / FormatException → no hay (más) código.
    return null
  } finally {
    reader.reset()
  }
}

// Tope de códigos por billete: suficiente para grupos y evita bucles largos.
const MAX_CODES = 8

function decodeAll(reader: MultiFormatReader, canvas: HTMLCanvasElement): DetectedCode[] {
  const out: DetectedCode[] = []
  for (let i = 0; i < MAX_CODES; i++) {
    const found = decodeCanvas(reader, canvas)
    if (!found) break
    out.push(found.code)
    if (!found.masked) break
  }
  return out
}

async function run(src: string, isPdf: boolean): Promise<DetectedCode[]> {
  const reader = buildReader()
  const all: DetectedCode[] = []
  if (isPdf) {
    // Los pases pueden repartirse en varias páginas (uno por viajero).
    for (let page = 1; page <= 5; page++) {
      const canvas = await pdfPageToCanvas(src, page).catch(() => null)
      if (!canvas) break
      all.push(...decodeAll(reader, canvas))
      if (all.length >= MAX_CODES) break
    }
    return all
  }
  const canvas = await imageToCanvas(src)
  all.push(...decodeAll(reader, canvas))
  return all
}

// Caché por clave estable (el valor guardado en BD, no la URL firmada que cambia
// en cada petición). Evita re-decodificar el mismo billete al re-renderizar.
const cache = new Map<string, Promise<DetectedCode[]>>()

export function detectCode(cacheKey: string, src: string, isPdf: boolean): Promise<DetectedCode[]> {
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const promise = run(src, isPdf).catch(() => [])
  cache.set(cacheKey, promise)
  return promise
}
