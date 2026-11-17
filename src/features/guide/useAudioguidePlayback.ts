import { useEffect, useMemo, useRef, useState, type AudioHTMLAttributes, type RefObject } from 'react'
import type { AudioguideStop } from '@/types/database'
import { haversineKm } from '@/lib/travelTime'
import { stopPoint } from '@/lib/queries/audioguideStopLocations'
import { useAuthStore } from '@/store/authStore'
import { useAudioguideGroupPlayback, type AudioguideSyncState } from '@/lib/realtime/useAudioguideGroupPlayback'
import { useAudioUrls } from '@/lib/audioCache'
import { useMediaSession } from '@/hooks/useMediaSession'
import { emitirUso } from '@/lib/usage'
import { guardarPosicionAudio, leerPosicionAudio } from '@/lib/resumeState'

// LA LÓGICA DE REPRODUCCIÓN DE LA AUDIOGUÍA.
//
// Es el antiguo componente AudioguidePlayer sin su interfaz: se ha movido tal
// cual (mismos refs, mismos efectos, mismo orden, mismos comentarios) porque
// funciona en iOS después de muchos arreglos y cada línea rara tiene su porqué.
// Lo único que cambia es la forma: en vez de pintar los dos <audio> y los
// botones, recibe sus refs y devuelve los manejadores para que los pinte quien
// lo usa (PlaybackHost monta los <audio>; AudioguidePlayerView y MiniPlayer, la
// interfaz). NO «limpiar» nada aquí sin probarlo en un iPhone con la pantalla
// bloqueada.

interface Options {
  stops: AudioguideStop[]
  audioguideId: string
  /** Para el «álbum» de la ficha del reproductor del sistema. */
  activityTitle: string
  /** Portada de la pantalla de bloqueo. */
  coverUrl?: string | null
  /** El <audio> de la audioguía. Lo crea y lo monta quien llama (PlaybackHost). */
  audioRef: RefObject<HTMLAudioElement | null>
  /** El <audio> del ancla de silencio (ver goTo). También lo monta quien llama. */
  silencioRef: RefObject<HTMLAudioElement | null>
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]

// Por debajo de esta separación entre paradas, la audioguía transcurre dentro
// de un mismo edificio o recinto: el mapa no aporta nada y no se ofrece.
const MIN_DISPERSION_KM = 0.15

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Reproductor paso a paso con controles propios (nada de UI nativa del
// navegador, que varía mucho entre móvil y escritorio): parada actual con
// su dirección, un reproductor con play/pausa grande y salto ±15s, y un
// índice plegable para saltar a cualquier parada. Si te unes al grupo, tus
// acciones (play/pausa/salto) se emiten a los demás dispositivos del viaje
// y las suyas se aplican aquí. Además, la parada que suena se publica en el
// reproductor del sistema (pantalla de bloqueo, auriculares, CarPlay).
export function useAudioguidePlayback({ stops, audioguideId, activityTitle, coverUrl, audioRef, silencioRef }: Options) {
  const { user } = useAuthStore()
  // Por dónde ibas de esta audioguía (ver resumeState.ts). Se lee una sola vez,
  // al montar: si iOS ha matado la app a mitad de una parada, al volver se abre
  // en esa parada y en ese segundo en lugar de en la primera.
  const [reanudar] = useState(() => leerPosicionAudio(audioguideId))
  const [index, setIndex] = useState(() => {
    const i = reanudar ? stops.findIndex((s) => s.id === reanudar.stopId) : -1
    return i === -1 ? 0 : i
  })
  // Abierto de entrada: lo primero que se quiere ver al abrir una audioguía es
  // de qué va, y eso son los títulos de las paradas. Se cierra solo al elegir
  // una (ver goTo), que es cuando estorba.
  const [showIndex, setShowIndex] = useState(true)
  // Parada sobre la que centrar el mapa; null = mapa cerrado.
  const [mapFocusIndex, setMapFocusIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const applyingRemoteRef = useRef(false)
  const pendingRemoteRef = useRef<AudioguideSyncState | null>(null)
  // ¿La parada que llega tiene que arrancar sola? (venías escuchando y has
  // pulsado siguiente, aquí o en el reproductor del móvil).
  const shouldAutoPlayRef = useRef(false)
  // La parada nueva ya se ha arrancado desde el propio gesto, así que el efecto
  // del cambio de parada no debe pausarla (ver goTo).
  const arrancadaEnGestoRef = useRef(false)
  // Ancla de sesión de audio para el relevo entre paradas (ver goTo): es el
  // silencioRef que llega por parámetro.
  const silencioDesbloqueadoRef = useRef(false)
  // El pause() del cambio de parada no es un gesto del usuario: no debe salir
  // hacia el grupo como si alguien hubiera dado a la pausa.
  const changingStopRef = useRef(false)
  // Segundo al que hay que saltar en cuanto el audio cargue, una sola vez. Deja
  // de valer en cuanto cambias de parada a mano: entonces mandas tú.
  const reanudarRef = useRef(reanudar)
  // La posición se apunta como mucho cada dos segundos: onTimeUpdate salta
  // cuatro veces por segundo y no hace falta escribir tanto en disco.
  const ultimoApunteRef = useRef(0)

  const group = useAudioguideGroupPlayback({ audioguideId, userId: user?.id ?? '' })
  const stop = stops[index]

  // El mapa solo tiene sentido si la audioguía recorre sitios distintos: al
  // menos dos paradas localizadas y separadas de verdad entre sí. En una
  // audioguía de un único museo la pantalla se queda como estaba.
  const hasMap = useMemo(() => {
    const puntos = stops.map(stopPoint).filter((p): p is NonNullable<typeof p> => !!p)
    if (puntos.length < 2) return false
    return puntos.some((a, i) => puntos.slice(i + 1).some(b => haversineKm(a, b) > MIN_DISPERSION_KM))
  }, [stops])
  // blob: local si la parada está descargada (suena sin conexión), y si no la
  // URL pública de siempre. Se resuelven la actual y sus DOS vecinas: al pulsar
  // «siguiente» hay que poder asignar el src y arrancar sin esperar a nada,
  // porque iOS solo da permiso dentro del propio gesto (ver useAudioUrls).
  const ventanaUrls = useMemo(
    () => [stops[index - 1]?.audio_url, stops[index]?.audio_url, stops[index + 1]?.audio_url],
    [stops, index],
  )
  const audio = useAudioUrls(ventanaUrls)
  const audioSrc = audio.resolve(stop?.audio_url)

  // Al cambiar de parada hay que reiniciar a mano tiempos y estado: antes lo
  // hacía el remontaje del <audio> (key={stop.id}), pero ahora el elemento es
  // uno solo y sobrevive a todas las paradas (ver el comentario del <audio>).
  // No se toca el src aquí: dejar cargado el audio anterior, en pausa, mantiene
  // viva la ficha del reproductor del móvil en el hueco entre paradas.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    changingStopRef.current = true
    // Si la parada ya la ha arrancado el propio gesto (ver goTo), pausar aquí
    // mataría justo lo que se acaba de conseguir: este efecto corre DESPUÉS de
    // pintar, o sea después del play().
    if (!arrancadaEnGestoRef.current) {
      el.pause()
      setIsPlaying(false)
    }
    arrancadaEnGestoRef.current = false
    setCurrentTime(0)
    setDuration(0)
    const timer = setTimeout(() => { changingStopRef.current = false }, 300)
    return () => clearTimeout(timer)
  }, [stop?.id, audioRef])

  // La URL reproducible llega con retraso (hay que mirar antes si la parada
  // está descargada). Cuando llega, se asigna aquí y no como prop de React:
  // si audioSrc fuese null, React quitaría el atributo src, y quitarlo no
  // recarga nada — te quedarías oyendo la parada anterior.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !audioSrc || el.src === audioSrc) return
    el.src = audioSrc
    // SIN load(). Asignar src ya dispara la carga, y load() además REINICIA el
    // elemento: en iOS eso le quita el «desbloqueo» heredado del último gesto y
    // el play() siguiente sale rechazado. Es camino de respaldo —el caso normal
    // lo resuelve goTo dentro del gesto—, pero tiene que dejar el elemento en
    // condiciones de sonar.
    el.defaultPlaybackRate = playbackRate
    el.playbackRate = playbackRate
    if (shouldAutoPlayRef.current) el.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSrc])

  function applyRemote(state: AudioguideSyncState) {
    const el = audioRef.current
    if (!el) return
    applyingRemoteRef.current = true
    el.defaultPlaybackRate = state.playbackRate
    el.playbackRate = state.playbackRate
    setPlaybackRate(state.playbackRate)
    const elapsed = state.isPlaying ? ((Date.now() - state.sentAt) / 1000) * state.playbackRate : 0
    const target = Math.max(0, state.positionSeconds + elapsed)
    if (Math.abs(el.currentTime - target) > 1) el.currentTime = target
    if (state.isPlaying) el.play().catch(() => {})
    else el.pause()
    setTimeout(() => { applyingRemoteRef.current = false }, 300)
  }

  // Cuando llega un estado del grupo (de otro dispositivo, o el último
  // conocido al unirte): cambia de parada si hace falta y ajusta el audio.
  useEffect(() => {
    if (!group.joined || !group.remoteState) return
    const state = group.remoteState
    const targetIndex = stops.findIndex((s) => s.id === state.stopId)
    if (targetIndex === -1) return
    if (targetIndex !== index) {
      pendingRemoteRef.current = state
      // Es justo el caso que la regla permite (un estado que llega de fuera, del
      // canal del grupo), pero aquí entra por un hook y no por un callback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(targetIndex)
      return
    }
    applyRemote(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.remoteState, group.joined])

  const broadcastIfJoined = (playing: boolean) => {
    if (!stop || !group.joined || applyingRemoteRef.current || changingStopRef.current) return
    if (!audioRef.current) return
    group.sendState({
      stopId: stop.id,
      positionSeconds: audioRef.current.currentTime,
      isPlaying: playing,
      playbackRate: audioRef.current.playbackRate,
    })
  }

  // Ojo con !audioRef.current?.paused: da true cuando el ref todavía es null.
  const isActuallyPlaying = () => !!audioRef.current && !audioRef.current.paused

  const anotarPosicion = (seconds?: number) => {
    const el = audioRef.current
    if (!el || !stop) return
    ultimoApunteRef.current = Date.now()
    guardarPosicionAudio(audioguideId, stop.id, seconds ?? el.currentTime)
  }

  // Si venías escuchando, la parada que llega arranca sola; si estabas en
  // pausa, se queda en pausa. Vale igual para los botones de aquí abajo y para
  // el «siguiente» del reproductor del móvil.
  const goTo = (i: number, options?: { autoPlay?: boolean }) => {
    const target = stops[i]
    if (!target) return
    const autoPlay = options?.autoPlay ?? false
    shouldAutoPlayRef.current = autoPlay
    // Has elegido parada: lo que quedara por reanudar ya no vale.
    reanudarRef.current = null
    anotarPosicion(0)

    // AQUÍ, EN EL GESTO, Y NO EN UN EFECTO.
    //
    // iOS solo concede play() si sale en la misma tarea que el toque del
    // usuario. Los efectos de React corren después de pintar, así que hacerlo
    // allí llegaba tarde: play() se rechazaba y, como el rechazo se tragaba, la
    // parada siguiente se quedaba muda. Con la pantalla bloqueada ni siquiera
    // resolvía la caché hasta desbloquear el móvil.
    //
    // La vecina ya está resuelta (useAudioUrls adelanta ±1), así que aquí solo
    // hay asignaciones síncronas. Si no lo estuviera —saltar desde el índice a
    // una parada lejana—, se cae al efecto de audioSrc, que para eso sigue.
    const el = audioRef.current
    const src = audio.resolve(target.audio_url)
    if (autoPlay && el && src) {
      arrancadaEnGestoRef.current = true

      // EL ANCLA DE SILENCIO. Sin esto, pasar de parada con la pantalla
      // bloqueada cambia el título pero no suena nada.
      //
      // Comprobado en el iPhone: si bloqueas mientras ya suena, sigue sonando
      // — iOS mantiene la sesión de audio de una página que ya la tenía. Lo que
      // no hace es CONCEDERLA de nuevo con la página oculta. Y asignar un src
      // nuevo descarga el fichero anterior, con lo que la página se queda un
      // instante sin nada reproduciendo y pierde la sesión: a partir de ahí el
      // reloj avanza pero no sale audio hasta desbloquear.
      //
      // Un audio en silencio sonando DURANTE el relevo tapa ese hueco: la
      // página nunca se queda a cero, así que no hay sesión que reconceder. Se
      // para en cuanto la parada nueva ha arrancado de verdad.
      const silencio = silencioRef.current
      silencio?.play().catch(() => {})
      const soltarAncla = () => { try { silencio?.pause() } catch { /* noop */ } }

      if (el.src !== src) el.src = src
      el.defaultPlaybackRate = playbackRate
      el.playbackRate = playbackRate
      el.play()
        .then(soltarAncla)
        .catch(() => { soltarAncla(); arrancadaEnGestoRef.current = false })
    }

    setIndex(i)
    setShowIndex(false)
    if (group.joined) {
      const state: AudioguideSyncState = {
        stopId: target.id, positionSeconds: 0, isPlaying: autoPlay, playbackRate, sentAt: Date.now(),
      }
      pendingRemoteRef.current = state
      group.sendState(state)
    }
  }

  // Solo la PRIMERA reproducción de la sesión: lo que interesa es «esta
  // audioguía se escuchó», no cuántas veces se pausó y se reanudó.
  const yaContado = useRef(false)

  // El ancla también necesita haber sonado una vez desde un gesto de verdad:
  // en iOS un elemento que nunca ha reproducido no puede hacerlo por su cuenta,
  // y entonces no serviría de ancla justo cuando hace falta. Se hace en el play
  // de la pantalla, que es un toque directo, y una sola vez por sesión.
  const desbloquearAncla = () => {
    const s = silencioRef.current
    if (!s || silencioDesbloqueadoRef.current) return
    silencioDesbloqueadoRef.current = true
    s.play()
      .then(() => s.pause())
      .catch(() => { silencioDesbloqueadoRef.current = false })
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    desbloquearAncla()
    if (el.paused) {
      if (!yaContado.current) {
        yaContado.current = true
        emitirUso('audioguide.played', { paradas: stops.length })
      }
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }

  const skip = (deltaSeconds: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(0, el.currentTime + deltaSeconds), el.duration || Infinity)
  }

  // Ir a un segundo concreto: lo usan la barra de progreso y el guion (tocar una frase).
  const seek = (seconds: number) => {
    const el = audioRef.current
    if (el) el.currentTime = seconds
    setCurrentTime(seconds)
  }

  // Abrir el mapa no toca el audio: el diálogo se pinta en un portal y los
  // <audio> siguen montados, así que se sigue oyendo.
  const openMap = (focus: number) => {
    setMapFocusIndex(focus)
    emitirUso('audioguide.map_opened', { paradas: stops.filter(s => stopPoint(s)).length })
  }
  const closeMap = () => setMapFocusIndex(null)

  const cycleRate = () => {
    if (!stop) return
    const nextRate = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = nextRate
      audioRef.current.playbackRate = nextRate
    }
    if (group.joined && audioRef.current) {
      group.sendState({
        stopId: stop.id,
        positionSeconds: audioRef.current.currentTime,
        isPlaying: !audioRef.current.paused,
        playbackRate: nextRate,
      })
    }
  }

  const handleToggleGroup = async () => {
    if (group.joined) { group.leave(); return }
    // Un play/pause silencioso, disparado por este toque directo del
    // usuario, "desbloquea" el autoplay en este navegador para cuando
    // luego llegue una orden de reproducir desde otro dispositivo.
    const el = audioRef.current
    if (el) { try { await el.play(); el.pause() } catch { /* noop */ } }
    await group.join()
  }

  useMediaSession({
    // A propósito no depende de audioSrc, que se queda en null mientras se
    // resuelve la parada nueva: si apagáramos la ficha en ese hueco, el
    // reproductor del móvil desaparecería justo al pulsar «siguiente».
    enabled: !!stop?.audio_url,
    title: stop?.title ?? '',
    artist: `Parada ${index + 1} de ${stops.length}`,
    album: `Audioguía · ${activityTitle}`,
    coverUrl,
    isPlaying,
    position: currentTime,
    duration,
    playbackRate,
    onPlay: () => { audioRef.current?.play().catch(() => {}) },
    onPause: () => audioRef.current?.pause(),
    onNext: index < stops.length - 1
      ? () => goTo(index + 1, { autoPlay: isActuallyPlaying() })
      : null,
    // En la primera parada, «anterior» reinicia esta —lo que hace cualquier
    // reproductor—. No se pasa null: iOS lo leería como «no existe» y se
    // llevaría por delante también el botón de siguiente.
    onPrevious: index > 0
      ? () => goTo(index - 1, { autoPlay: isActuallyPlaying() })
      : () => {
          const el = audioRef.current
          if (!el) return
          el.currentTime = 0
          setCurrentTime(0)
        },
    onSeekTo: (seconds) => {
      const el = audioRef.current
      if (!el) return
      el.currentTime = seconds
      setCurrentTime(seconds)
    },
    onStop: () => {
      const el = audioRef.current
      if (!el) return
      el.pause()
      el.currentTime = 0
      setCurrentTime(0)
    },
  })

  // Los manejadores del <audio> principal. Antes eran props escritas en el JSX
  // del propio elemento; quien lo monte (PlaybackHost) se los pasa tal cual.
  const audioHandlers: AudioHTMLAttributes<HTMLAudioElement> = {
    onPlay: () => { shouldAutoPlayRef.current = false; setIsPlaying(true); broadcastIfJoined(true) },
    onPause: () => { setIsPlaying(false); broadcastIfJoined(false); anotarPosicion() },
    // Parada terminada: se apunta al principio, no al final. Si vuelves a
    // ella es para oírla otra vez, no para quedarte en el último segundo.
    onEnded: () => { setIsPlaying(false); anotarPosicion(0) },
    onTimeUpdate: () => {
      setCurrentTime(audioRef.current?.currentTime ?? 0)
      if (Date.now() - ultimoApunteRef.current > 2000) anotarPosicion()
    },
    onSeeked: () => broadcastIfJoined(!!audioRef.current && !audioRef.current.paused),
    onCanPlay: () => {
      // Red de seguridad: si el play() del efecto salió antes de que
      // hubiera datos y se quedó por el camino, se reintenta aquí.
      const el = audioRef.current
      if (shouldAutoPlayRef.current && el?.paused) el.play().catch(() => {})
    },
    onLoadedMetadata: () => {
      setDuration(audioRef.current?.duration ?? 0)
      // Volver al segundo donde lo dejaste, y en PAUSA: tras un arranque en
      // frío iOS no concede reproducir sin un gesto tuyo, así que intentarlo
      // solo dejaría la pantalla mintiendo con un botón de pausa que no suena.
      const pendiente = reanudarRef.current
      if (pendiente && pendiente.stopId === stop?.id && audioRef.current) {
        audioRef.current.currentTime = pendiente.seconds
        setCurrentTime(pendiente.seconds)
      }
      reanudarRef.current = null
      if (pendingRemoteRef.current) {
        // En grupo manda lo que diga el resto, no lo que quisiéramos aquí.
        shouldAutoPlayRef.current = false
        applyRemote(pendingRemoteRef.current)
        pendingRemoteRef.current = null
      }
    },
  }

  return {
    // Para quien monta el <audio> principal
    audioHandlers,
    // Estado
    audioguideId, stops, stop, index,
    isPlaying, currentTime, duration, playbackRate,
    hasMap, showIndex, mapFocusIndex,
    groupJoined: group.joined, groupCount: group.participantCount,
    // Acciones (todas pensadas para llamarse DENTRO del gesto del usuario)
    goTo, togglePlay, skip, seek, cycleRate, handleToggleGroup,
    isActuallyPlaying, setShowIndex, openMap, closeMap,
  }
}

export type AudioguidePlayback = ReturnType<typeof useAudioguidePlayback>
