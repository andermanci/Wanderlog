// Volver a donde estabas al reabrir la PWA.
//
// En iOS la app en modo standalone no se "reanuda": el sistema descarta la
// webview al cambiar de aplicación y, al volver, arranca en frío desde el
// start_url del manifest (`/`). No hay evento que avise ni API que devuelva el
// estado anterior, así que lo único posible es dejarlo escrito en disco antes
// de irse y reconstruirlo al arrancar. Esto guarda las dos piezas que se notan:
// la ruta (con su scroll) y por dónde ibas de una audioguía.
//
// Los datos de las pantallas no hacen falta aquí: la caché de React Query ya se
// persiste en localStorage (ver App.tsx), así que al volver se pintan sin ir a
// la red.

const KEY_RUTA = 'wanderlog-ultima-ruta'
const KEY_AUDIO = 'wanderlog-audioguia-posicion'

// Media hora desde que saliste de la app. Pasado ese rato, volver a la pantalla
// de una actividad de ayer desconcierta más que ayudar, y el dashboard es mejor
// punto de partida.
const CADUCIDAD_RUTA_MS = 30 * 60 * 1000
// La posición del audio aguanta más: está guardada por audioguía, así que no
// puede sorprenderte en otra pantalla, y retomar una parada al día siguiente es
// justo lo que se querría.
const CADUCIDAD_AUDIO_MS = 24 * 60 * 60 * 1000

interface RutaGuardada {
  path: string
  scrollTop: number
  /** Momento de la última señal de vida (navegación, scroll o salida de la app). */
  at: number
}

interface PosicionAudio {
  stopId: string
  seconds: number
  at: number
}

// Rutas que NO se recuerdan, cada una por su motivo:
// - `/` y las públicas de acceso: no son un sitio donde estuvieras.
// - Los destinos de enlace externo (compartir, invitación, callbacks): llegar
//   ahí sin los parámetros que traía el enlace no lleva a ninguna parte.
// - Los formularios: lo que se restauraría es un formulario en blanco, y lo que
//   se perdió (lo escrito a medias) no está aquí de todas formas.
// - El panel de administración: sus rutas llevan ids de OTRAS personas y de sus
//   viajes, y ahí ya se decidió no dejar nada suyo en localStorage (ver App.tsx).
const NO_RECORDAR = [
  /^\/$/,
  /^\/login/,
  /^\/auth\//,
  /^\/invite\//,
  /^\/import\//,
  /^\/privacidad/,
  /^\/admin/,
  /\/new$/,
  /\/edit$/,
]

// Recibe la ruta tal y como se guarda (con su query si la lleva); las reglas
// se aplican solo sobre el camino.
export function esRutaRecordable(ruta: string): boolean {
  const path = ruta.split('?')[0]
  return !NO_RECORDAR.some((r) => r.test(path))
}

function leerJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null // modo privado, cuota llena o un valor de una versión anterior
  }
}

function escribirJSON(key: string, valor: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(valor))
  } catch {
    /* sin almacenamiento se pierde la reanudación, no la app */
  }
}

// --- Ruta ---------------------------------------------------------------

export function guardarRuta(ruta: string): void {
  if (!esRutaRecordable(ruta)) return
  escribirJSON(KEY_RUTA, { path: ruta, scrollTop: 0, at: Date.now() } satisfies RutaGuardada)
}

/**
 * Refresca la marca de tiempo sin tocar nada más. Se llama justo cuando la app
 * pasa a segundo plano, que es el instante antes de que iOS pueda matarla: así
 * la caducidad cuenta desde que SALISTE y no desde que navegaste, y media hora
 * mirando una misma pantalla no te deja fuera.
 */
export function tocarRuta(): void {
  const guardada = leerJSON<RutaGuardada>(KEY_RUTA)
  if (!guardada) return
  escribirJSON(KEY_RUTA, { ...guardada, at: Date.now() })
}

export function guardarScroll(ruta: string, scrollTop: number): void {
  const guardada = leerJSON<RutaGuardada>(KEY_RUTA)
  // Solo si el registro sigue siendo el de esta pantalla: si no, este scroll es
  // de una ruta que ya se abandonó.
  if (!guardada || guardada.path !== ruta) return
  escribirJSON(KEY_RUTA, { ...guardada, scrollTop, at: Date.now() })
}

// El scroll que le toca a la ruta restaurada, a la espera de que su pantalla se
// monte. Vive en memoria y se consume una sola vez: restaurar el scroll en una
// navegación normal sería un error (ahí la pantalla nueva debe empezar arriba).
let scrollPendiente: { path: string; top: number } | null = null

/**
 * Qué ruta tocaba al arrancar en frío, o null si no hay ninguna reciente.
 * Deja preparado su scroll para que lo recoja el contenedor de la pantalla.
 */
export function rutaAlArrancar(): string | null {
  const guardada = leerJSON<RutaGuardada>(KEY_RUTA)
  if (!guardada?.path) return null
  if (Date.now() - guardada.at > CADUCIDAD_RUTA_MS) return null
  if (!esRutaRecordable(guardada.path)) return null
  if (guardada.scrollTop > 0) scrollPendiente = { path: guardada.path, top: guardada.scrollTop }
  return guardada.path
}

export function tomarScrollPendiente(ruta: string): number | null {
  if (!scrollPendiente || scrollPendiente.path !== ruta) return null
  const { top } = scrollPendiente
  scrollPendiente = null
  return top
}

// --- Audioguías ---------------------------------------------------------

export function guardarPosicionAudio(audioguideId: string, stopId: string, seconds: number): void {
  const todas = leerJSON<Record<string, PosicionAudio>>(KEY_AUDIO) ?? {}
  todas[audioguideId] = { stopId, seconds, at: Date.now() }
  escribirJSON(KEY_AUDIO, todas)
}

export function leerPosicionAudio(audioguideId: string): { stopId: string; seconds: number } | null {
  const guardada = leerJSON<Record<string, PosicionAudio>>(KEY_AUDIO)?.[audioguideId]
  if (!guardada) return null
  if (Date.now() - guardada.at > CADUCIDAD_AUDIO_MS) return null
  return { stopId: guardada.stopId, seconds: guardada.seconds }
}
