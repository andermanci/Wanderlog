/**
 * Capa fina sobre la Media Session API: lo que hace que la audioguía aparezca
 * en la pantalla de bloqueo del móvil, en el centro de control, en los
 * auriculares y en CarPlay, con su título y sus botones de anterior/siguiente.
 *
 * Existe como módulo aparte por dos motivos:
 *  1. Safari LANZA (no ignora) al registrar acciones que no soporta, y también
 *     en setPositionState si la duración es NaN o la posición se sale de rango.
 *     Todas esas guardas viven aquí, en un sitio y probadas.
 *  2. Recibiendo la sesión por parámetro se puede probar sin navegador.
 */

/** Lo poco que usamos de MediaSession, para poder pasarle un doble en los tests. */
export interface MediaSessionLike {
  metadata: MediaMetadata | null
  playbackState: MediaSessionPlaybackState
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void
  setPositionState?(state?: MediaPositionState): void
}

/** Todas las acciones que registramos; sirve también para limpiarlas de golpe. */
export const MEDIA_SESSION_ACTIONS: readonly MediaSessionAction[] = [
  'play', 'pause', 'stop', 'nexttrack', 'previoustrack',
  'seekbackward', 'seekforward', 'seekto',
]

/** El mismo salto que los botones de ±15 s de dentro de la app. */
export const SEEK_OFFSET_SECONDS = 15

export function getMediaSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null
  return navigator.mediaSession as MediaSessionLike
}

/** Devuelve si se pudo registrar: Safari lanza con las acciones que no soporta. */
export function setActionHandlerSafe(
  session: MediaSessionLike,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): boolean {
  try {
    session.setActionHandler(action, handler)
    return true
  } catch {
    return false
  }
}

/**
 * Estado de posición saneado, o null si no hay nada que mandar. Con una
 * duración NaN (audio sin cargar del todo) o una posición mayor que la
 * duración, Safari lanza un TypeError en vez de ignorarlo.
 */
export function buildPositionState(
  duration: number,
  position: number,
  playbackRate: number,
): MediaPositionState | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
  const safePosition = Number.isFinite(position) ? Math.min(Math.max(0, position), duration) : 0
  return { duration, position: safePosition, playbackRate: rate }
}

/** Manda la posición al sistema. Devuelve si se llegó a mandar de verdad. */
export function applyPositionState(
  session: MediaSessionLike,
  duration: number,
  position: number,
  playbackRate: number,
): boolean {
  if (typeof session.setPositionState !== 'function') return false
  const state = buildPositionState(duration, position, playbackRate)
  if (!state) return false
  try {
    session.setPositionState(state)
    return true
  } catch {
    return false
  }
}

/** Absoluta: algunos navegadores no resuelven bien las relativas del artwork. */
export function toAbsoluteUrl(src: string): string {
  try {
    return new URL(src, document.baseURI).href
  } catch {
    return src
  }
}

/**
 * Portadas para la pantalla de bloqueo: primero la del sitio y detrás siempre
 * el icono de la app, que es del mismo origen y está precacheado. Así, si la
 * primera no carga (sin conexión, o una petición que no pasa por el service
 * worker), al navegador le queda una alternativa.
 */
export function buildArtwork(coverUrl?: string | null): MediaImage[] {
  const artwork: MediaImage[] = []
  if (coverUrl) artwork.push({ src: toAbsoluteUrl(coverUrl), sizes: '512x512' })
  artwork.push({ src: toAbsoluteUrl('/pwa-512.png'), sizes: '512x512', type: 'image/png' })
  return artwork
}

/** Deja la sesión como si nunca hubiéramos pasado por aquí. */
export function clearMediaSession(session: MediaSessionLike): void {
  for (const action of MEDIA_SESSION_ACTIONS) setActionHandlerSafe(session, action, null)
  try { session.metadata = null } catch { /* noop */ }
  try { session.playbackState = 'none' } catch { /* noop */ }
}
