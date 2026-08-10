import { useEffect, useRef } from 'react'
import {
  ACCIONES_REGISTRADAS, MEDIA_SESSION_ACTIONS, applyPositionState, buildArtwork,
  clearMediaSession, getMediaSession, setActionHandlerSafe,
} from '@/lib/mediaSession'

interface Options {
  /** Solo cuando hay audio cargado: si no, no publicamos ficha ninguna. */
  enabled: boolean
  title: string
  /** Línea de debajo del título, p. ej. «Parada 3 de 8». */
  artist: string
  album: string
  coverUrl?: string | null
  isPlaying: boolean
  position: number
  duration: number
  playbackRate: number
  onPlay: () => void
  onPause: () => void
  /**
   * null en la última parada. El botón SIGUE saliendo en el reproductor del
   * sistema y no hace nada al pulsarlo: ver el comentario de `nexttrack`, iOS
   * no permite tener uno solo del par.
   */
  onNext: (() => void) | null
  /** Nunca null en la práctica: en la primera parada, reinicia esta. */
  onPrevious: (() => void) | null
  onSeekTo: (seconds: number) => void
  onStop: () => void
}

// Publica lo que está sonando en el reproductor del sistema: título, portada y
// botones de anterior/siguiente en la pantalla de bloqueo, el centro de
// control, los auriculares y CarPlay.
//
// Los ±15 s NO salen ahí a propósito: iOS solo tiene dos huecos y, si se
// registran, se comen los de anterior y siguiente.
export function useMediaSession(options: Options) {
  // Los callbacks NO se sacan aquí: se leen del ref dentro de los manejadores.
  // Sacarlos invitaría a meterlos en las dependencias del efecto, y volver a
  // registrar las acciones en cada cambio de parada es lo que hace parpadear
  // los botones del reproductor del sistema.
  const {
    enabled, title, artist, album, coverUrl, isPlaying, position, duration, playbackRate,
  } = options

  // Los callbacks son closures nuevas en cada render. Si dependiéramos de
  // ellas para registrar, estaríamos volviendo a registrar las ocho acciones
  // cuatro veces por segundo, en cada timeupdate. Con este ref (refrescado en
  // todos los renders) los handlers registrados son estables y siempre llaman
  // a la versión fresca.
  const handlersRef = useRef(options)
  useEffect(() => { handlersRef.current = options })

  useEffect(() => {
    const session = getMediaSession()
    if (!session || !enabled) return

    // Se recorre ACCIONES_REGISTRADAS en vez de llamar ocho veces a mano, y no
    // es cosmético: así la lista de acciones es la ÚNICA fuente de verdad y no
    // puede desalinearse de su test. Añadir aquí un 'seekforward' suelto no
    // haría nada mientras no esté en la lista — que es justo lo que impide
    // volver a romper los botones de iOS sin enterarse.
    const manejadores: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {
      play: () => handlersRef.current.onPlay(),
      pause: () => handlersRef.current.onPause(),
      stop: () => handlersRef.current.onStop(),
      seekto: (details) => {
        if (typeof details.seekTime === 'number') handlersRef.current.onSeekTo(details.seekTime)
      },
      // LOS DOS SIEMPRE REGISTRADOS, aunque en el extremo no haya adónde ir.
      //
      // Registrar `null` significa «esta acción no existe», y entonces iOS se
      // queda con un solo control de pista, no puede formar el par de botones
      // laterales y VUELVE A SUS SALTOS DE ±10 s. O sea: poner null en la
      // primera parada para que el botón saliera atenuado hacía desaparecer
      // también el de siguiente. Es todo o nada.
      //
      // Si no hay adónde ir, el manejador no hace nada. Un botón que no
      // responde en el extremo es mucho menos malo que no tener ninguno.
      nexttrack: () => handlersRef.current.onNext?.(),
      previoustrack: () => handlersRef.current.onPrevious?.(),
    }

    for (const accion of ACCIONES_REGISTRADAS) {
      setActionHandlerSafe(session, accion, manejadores[accion] ?? null)
    }

    return () => {
      for (const action of MEDIA_SESSION_ACTIONS) setActionHandlerSafe(session, action, null)
    }
    // Sin `hasNext`/`hasPrevious` en las dependencias: los manejadores ya no
    // cambian al movernos entre paradas —leen del ref—, así que registrarlos
    // una sola vez basta. Antes se volvían a registrar en cada cambio de
    // parada, y ese re-registro es justo lo que hacía parpadear los botones.
  }, [enabled])

  useEffect(() => {
    const session = getMediaSession()
    if (!session) return
    if (!enabled) {
      try { session.metadata = null } catch { /* noop */ }
      return
    }
    if (typeof MediaMetadata === 'undefined') return
    try {
      session.metadata = new MediaMetadata({ title, artist, album, artwork: buildArtwork(coverUrl) })
    } catch { /* noop */ }
  }, [enabled, title, artist, album, coverUrl])

  useEffect(() => {
    const session = getMediaSession()
    if (!session) return
    try {
      session.playbackState = !enabled ? 'none' : isPlaying ? 'playing' : 'paused'
    } catch { /* noop */ }
  }, [enabled, isPlaying])

  // El sistema extrapola la posición él solo a partir de la velocidad, así que
  // no hace falta reenviársela en cada timeupdate (cuatro por segundo). Solo
  // cuando cambia algo de verdad, o cuando la posición se ha ido más de dos
  // segundos de lo último que mandamos: un salto, o la vuelta del segundo
  // plano, donde el móvil congela el JS y el reloj se desfasa.
  const lastSentRef = useRef<{ duration: number; playbackRate: number; isPlaying: boolean; position: number } | null>(null)
  useEffect(() => {
    const session = getMediaSession()
    if (!session || !enabled) return
    const last = lastSentRef.current
    const worthSending = !last
      || last.duration !== duration
      || last.playbackRate !== playbackRate
      || last.isPlaying !== isPlaying
      || Math.abs(position - last.position) > 2
    if (!worthSending) return
    if (applyPositionState(session, duration, position, playbackRate)) {
      lastSentRef.current = { duration, playbackRate, isPlaying, position }
    }
  }, [enabled, duration, playbackRate, isPlaying, position])

  // Al salir de la audioguía, la ficha del sistema se va con ella.
  useEffect(() => {
    const session = getMediaSession()
    return () => { if (session) clearMediaSession(session) }
  }, [])
}
