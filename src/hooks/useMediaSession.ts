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
    if (!session) return
    if (!enabled) {
      // Ya no hay cleanup por pasada, así que apagar la ficha se hace aquí de
      // forma explícita: si no, los manejadores se quedarían puestos apuntando
      // a un reproductor que ya no está.
      for (const accion of MEDIA_SESSION_ACTIONS) setActionHandlerSafe(session, accion, null)
      return
    }

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

    // SE RECORREN TODAS, no solo las que queremos: las que no están en el mapa
    // se ponen a null EXPLÍCITAMENTE.
    //
    // Esa es la clave de los ±10 s. Esos botones no los pone este código: los
    // pone WebKit por su cuenta para cualquier <audio>. Dejar de registrar
    // 'seekbackward'/'seekforward' no los quita —no registrar no es lo mismo
    // que rechazar—; hay que asignarles null a propósito para decirle a Safari
    // que no los queremos. Solo entonces libera los dos huecos y pone en ellos
    // anterior y siguiente.
    for (const accion of MEDIA_SESSION_ACTIONS) {
      setActionHandlerSafe(session, accion, manejadores[accion] ?? null)
    }

    // SIN cleanup que anule los manejadores en cada pasada. Anularlos y
    // volver a ponerlos deja un instante sin ninguno, y si iOS mira justo ahí
    // se queda con sus botones por defecto. La limpieza de verdad va al
    // desmontar, en el efecto del final.

    // POR QUÉ SE VUELVE A REGISTRAR AL EMPEZAR A SONAR (`isPlaying`):
    //
    // iOS no crea la ficha de «reproduciendo ahora» hasta que hay audio de
    // verdad sonando, y los manejadores puestos ANTES de ese momento no los
    // recoge. Registrarlos solo al montar bastaba para la parada 2 en
    // adelante —al cambiar de parada cambia el título, se reescribe la ficha
    // y iOS vuelve a mirar—, pero en la PRIMERA parada eso no llega a pasar
    // nunca: se registraban antes del primer play y ahí se quedaban,
    // ignorados, con los saltos de ±10 s ocupando los dos huecos.
    //
    // Volver a registrarlos cuando arranca la reproducción y cuando cambia la
    // parada cuesta cuatro llamadas y quita la asimetría.
  }, [enabled, title, isPlaying])

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
