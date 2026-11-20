import { memo, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePlaybackStore, type PlaybackSession } from './playbackStore'
import { useAudioguidePlayback } from './useAudioguidePlayback'

/**
 * Dueño del audio. No pinta nada visible: monta los dos <audio> de la audioguía
 * cargada y ejecuta su lógica (useAudioguidePlayback).
 *
 * Hay uno fijo en el armazón (lo trae <MiniPlayer>, `primary`), y por eso el
 * audio sobrevive al cambiar de pantalla. La pantalla del reproductor monta
 * otro de reserva, que solo actúa si no hay ninguno fijo (p. ej. si alguien
 * quita el MiniPlayer del armazón): así el reproductor nunca se queda mudo.
 *
 * Va memoizado A PROPÓSITO: el de reserva cuelga de la pantalla del
 * reproductor, que se repinta cada vez que este anfitrión publica su estado. Sin
 * memo, ese repintado volvía a pintar el anfitrión, que volvía a publicar: un
 * bucle que tumbaba la pantalla («Maximum update depth exceeded»).
 */
export const PlaybackHost = memo(function PlaybackHost({ primary }: { primary?: boolean }) {
  const session = usePlaybackStore(s => s.session)
  const hayFijo = usePlaybackStore(s => s.primaryHosts > 0)
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    if (!primary) return
    const { addPrimaryHost } = usePlaybackStore.getState()
    addPrimaryHost(1)
    return () => addPrimaryHost(-1)
  }, [primary])

  // El de reserva espera un instante antes de decidir: en la primera carga el
  // fijo puede registrarse en el mismo pintado, justo después.
  const [decidido, setDecidido] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDecidido(true), 0)
    return () => clearTimeout(t)
  }, [])

  // Sin sesión de usuario no hay nada que deba seguir sonando.
  useEffect(() => {
    if (primary && !user) usePlaybackStore.getState().close()
  }, [primary, user])

  const activo = primary || (decidido && !hayFijo)
  if (!activo || !session) return null
  // key: una audioguía distinta es un reproductor nuevo (posición guardada,
  // grupo, <audio>), igual que antes lo era al entrar en otra pantalla.
  return <PlaybackEngine key={session.audioguideId} session={session} />
})

function PlaybackEngine({ session }: { session: PlaybackSession }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const silencioRef = useRef<HTMLAudioElement>(null)
  const playback = useAudioguidePlayback({
    audioRef,
    silencioRef,
    stops: session.stops,
    audioguideId: session.audioguideId,
    activityTitle: session.title,
    coverUrl: session.coverUrl,
  })

  // Publicar lo último en cada render: las pantallas llaman a estas funciones
  // desde sus botones, dentro del gesto, igual que si fueran suyas.
  useEffect(() => { usePlaybackStore.getState().setApi(playback) })
  useEffect(() => () => usePlaybackStore.getState().setApi(null), [])

  if (!playback.stop) return null

  return (
    <>
      {/* UN SOLO <audio> para toda la audioguía, fuera de cualquier condicional
          y sin key: no puede desmontarse nunca. En el iPhone, un elemento
          recién creado no está «desbloqueado» por un gesto del usuario y su
          play() sale rechazado — justo lo que pasaría al pulsar «siguiente»
          desde la pantalla de bloqueo. Y cambiar de elemento reinicia la ficha
          del reproductor del sistema en cada parada. El src se asigna en un
          efecto, no aquí. */}
      {/* Ancla de sesión de audio. Un segundo de silencio en bucle que solo
          suena mientras se releva el fichero de una parada a la siguiente, para
          que la página no se quede ni un instante sin nada reproduciendo. Ver
          el bloque largo de goTo. Va empaquetado en el build, así que también
          está disponible sin conexión. */}
      <audio ref={silencioRef} className="sr-only" src="/silencio.wav" loop preload="auto" />

      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        {...playback.audioHandlers}
      />
    </>
  )
}
