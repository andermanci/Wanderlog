import { useEffect, useRef, useState } from 'react'
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, Navigation, Pause, Play, RotateCcw, RotateCw, Users,
} from 'lucide-react'
import type { AudioguideStop } from '@/types/database'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useAudioguideGroupPlayback, type AudioguideSyncState } from '@/lib/realtime/useAudioguideGroupPlayback'
import { useAudioUrl } from '@/lib/audioCache'
import { useMediaSession } from '@/hooks/useMediaSession'
import { AudioguideTranscript } from './AudioguideTranscript'
import { emitirUso } from '@/lib/usage'

interface Props {
  stops: AudioguideStop[]
  audioguideId: string
  /** Para el «álbum» de la ficha del reproductor del sistema. */
  activityTitle: string
  /** Portada de la pantalla de bloqueo. */
  coverUrl?: string | null
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]

function formatTime(seconds: number): string {
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
export function AudioguidePlayer({ stops, audioguideId, activityTitle, coverUrl }: Props) {
  const { user } = useAuthStore()
  const [index, setIndex] = useState(0)
  const [showIndex, setShowIndex] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)
  const applyingRemoteRef = useRef(false)
  const pendingRemoteRef = useRef<AudioguideSyncState | null>(null)
  // ¿La parada que llega tiene que arrancar sola? (venías escuchando y has
  // pulsado siguiente, aquí o en el reproductor del móvil).
  const shouldAutoPlayRef = useRef(false)
  // El pause() del cambio de parada no es un gesto del usuario: no debe salir
  // hacia el grupo como si alguien hubiera dado a la pausa.
  const changingStopRef = useRef(false)

  const group = useAudioguideGroupPlayback({ audioguideId, userId: user?.id ?? '' })
  const stop = stops[index]
  // blob: local si la parada está descargada (suena sin conexión), y si no la
  // URL pública de siempre.
  const audioSrc = useAudioUrl(stop?.audio_url)

  // Al cambiar de parada hay que reiniciar a mano tiempos y estado: antes lo
  // hacía el remontaje del <audio> (key={stop.id}), pero ahora el elemento es
  // uno solo y sobrevive a todas las paradas (ver el comentario del <audio>).
  // No se toca el src aquí: dejar cargado el audio anterior, en pausa, mantiene
  // viva la ficha del reproductor del móvil en el hueco entre paradas.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    changingStopRef.current = true
    el.pause()
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    const timer = setTimeout(() => { changingStopRef.current = false }, 300)
    return () => clearTimeout(timer)
  }, [stop?.id])

  // La URL reproducible llega con retraso (hay que mirar antes si la parada
  // está descargada). Cuando llega, se asigna aquí y no como prop de React:
  // si audioSrc fuese null, React quitaría el atributo src, y quitarlo no
  // recarga nada — te quedarías oyendo la parada anterior.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !audioSrc || el.src === audioSrc) return
    el.src = audioSrc
    el.load()
    // load() devuelve playbackRate a defaultPlaybackRate: hay que fijar los dos
    // o la velocidad elegida se pierde en cada parada.
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

  // Si venías escuchando, la parada que llega arranca sola; si estabas en
  // pausa, se queda en pausa. Vale igual para los botones de aquí abajo y para
  // el «siguiente» del reproductor del móvil.
  const goTo = (i: number, options?: { autoPlay?: boolean }) => {
    const target = stops[i]
    if (!target) return
    const autoPlay = options?.autoPlay ?? false
    shouldAutoPlayRef.current = autoPlay
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

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
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

  if (!stop) return null

  return (
    <div className="space-y-3">
      {/* UN SOLO <audio> para toda la audioguía, fuera de cualquier condicional
          y sin key: no puede desmontarse nunca. En el iPhone, un elemento
          recién creado no está «desbloqueado» por un gesto del usuario y su
          play() sale rechazado — justo lo que pasaría al pulsar «siguiente»
          desde la pantalla de bloqueo. Y cambiar de elemento reinicia la ficha
          del reproductor del sistema en cada parada. El src se asigna en un
          efecto, no aquí. */}
      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        onPlay={() => { shouldAutoPlayRef.current = false; setIsPlaying(true); broadcastIfJoined(true) }}
        onPause={() => { setIsPlaying(false); broadcastIfJoined(false) }}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onSeeked={() => broadcastIfJoined(!!audioRef.current && !audioRef.current.paused)}
        onCanPlay={() => {
          // Red de seguridad: si el play() del efecto salió antes de que
          // hubiera datos y se quedó por el camino, se reintenta aquí.
          const el = audioRef.current
          if (shouldAutoPlayRef.current && el?.paused) el.play().catch(() => {})
        }}
        onLoadedMetadata={() => {
          setDuration(audioRef.current?.duration ?? 0)
          if (pendingRemoteRef.current) {
            // En grupo manda lo que diga el resto, no lo que quisiéramos aquí.
            shouldAutoPlayRef.current = false
            applyRemote(pendingRemoteRef.current)
            pendingRemoteRef.current = null
          }
        }}
      />

      <div className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: 'var(--secondary)' }}>
        <div className="flex items-center gap-1.5 text-xs">
          <Users size={13} />
          {group.joined
            ? <span>{group.participantCount} escuchando en grupo</span>
            : <span className="text-muted-foreground">Escucha en solitario</span>}
        </div>
        <button
          type="button"
          onClick={handleToggleGroup}
          className="text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:border-primary/50 transition-colors flex-shrink-0"
        >
          {group.joined ? 'Salir del grupo' : 'Unirse al grupo'}
        </button>
      </div>

      <div className="rounded-xl p-4 space-y-4 surface">
        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest">
          <span>Parada {index + 1} de {stops.length}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-pressed={showTranscript}
              title={showTranscript ? 'Ocultar el guion' : 'Leer el guion'}
              className={cn(
                'font-medium px-2 py-1 rounded-md border transition-colors',
                showTranscript ? 'border-primary text-foreground' : 'border-border hover:border-primary/50',
              )}
            >
              <BookOpen size={14} />
            </button>
            {stop.audio_url && (
              <button
                type="button"
                onClick={cycleRate}
                title="Velocidad de reproducción"
                className="font-medium px-2 py-1 rounded-md border border-border hover:border-primary/50 transition-colors normal-case tracking-normal"
              >
                {playbackRate}×
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="font-serif text-lg leading-snug mb-1">{stop.title}</p>
          {stop.summary && <p className="text-sm text-muted-foreground mb-2">{stop.summary}</p>}
          {stop.direction_text && (
            <p className="text-sm text-muted-foreground flex items-start gap-1.5">
              <Navigation size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
              <span>{stop.direction_text}</span>
            </p>
          )}
        </div>

        {stop.audio_url ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <span className="w-8 text-right flex-shrink-0">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => {
                  const el = audioRef.current
                  const value = Number(e.target.value)
                  if (el) el.currentTime = value
                  setCurrentTime(value)
                }}
                className="flex-1 h-1.5 cursor-pointer"
                style={{ accentColor: 'var(--primary)' }}
                aria-label="Progreso del audio"
              />
              <span className="w-8 flex-shrink-0">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => skip(-15)}
                aria-label="Retroceder 15 segundos"
                title="Retroceder 15 segundos"
                className="h-11 px-3 rounded-full flex flex-col items-center justify-center gap-0 border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex-shrink-0"
              >
                <RotateCcw size={16} />
                <span className="text-[10px] font-medium leading-none mt-0.5">15s</span>
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-transform flex-shrink-0"
                style={{ background: 'var(--primary)' }}
              >
                {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-1" />}
              </button>
              <button
                type="button"
                onClick={() => skip(15)}
                aria-label="Avanzar 15 segundos"
                title="Avanzar 15 segundos"
                className="h-11 px-3 rounded-full flex flex-col items-center justify-center gap-0 border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex-shrink-0"
              >
                <RotateCw size={16} />
                <span className="text-[10px] font-medium leading-none mt-0.5">15s</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Audio no disponible.</p>
        )}

        {showTranscript && (
          <AudioguideTranscript
            key={stop.id}
            stop={stop}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={stop.audio_url ? (seconds) => {
              const el = audioRef.current
              if (!el) return
              el.currentTime = seconds
              setCurrentTime(seconds)
            } : undefined}
          />
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, index - 1), { autoPlay: isActuallyPlaying() })}
            disabled={index === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-md border border-border disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(stops.length - 1, index + 1), { autoPlay: isActuallyPlaying() })}
            disabled={index === stops.length - 1}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-md border border-border disabled:opacity-40"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden surface">
        <button
          type="button"
          onClick={() => setShowIndex((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-muted-foreground uppercase tracking-widest"
        >
          <span>Índice de paradas ({stops.length})</span>
          <ChevronDown size={14} className={cn('transition-transform', showIndex && 'rotate-180')} />
        </button>

        {/* La lista crece entera y scrolla la página. Con su propio scroll
            (max-h + overflow-y-auto) el gesto se lo quedaba el contenedor de
            fuera en móvil y no había manera de recorrer las paradas: había que
            ir pasándolas una a una con "Siguiente". */}
        {showIndex && (
          <div className="space-y-1 px-3 pb-3">
            {stops.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  'w-full text-left rounded-md p-2.5 border transition-colors',
                  i === index ? 'border-primary' : 'border-border hover:border-primary/50',
                )}
                style={{ background: i === index ? 'var(--secondary)' : 'transparent' }}
              >
                <p className="text-sm font-medium">{i + 1}. {s.title}</p>
                {s.summary && <p className="text-xs text-muted-foreground mt-0.5">{s.summary}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
