import { useEffect, useRef, useState } from 'react'
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, Navigation, Pause, Play, RotateCcw, RotateCw, Users,
} from 'lucide-react'
import type { AudioguideStop } from '@/types/database'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useAudioguideGroupPlayback, type AudioguideSyncState } from '@/lib/realtime/useAudioguideGroupPlayback'
import { AudioguideTranscript } from './AudioguideTranscript'

interface Props {
  stops: AudioguideStop[]
  audioguideId: string
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
// y las suyas se aplican aquí.
export function AudioguidePlayer({ stops, audioguideId }: Props) {
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

  const group = useAudioguideGroupPlayback({ audioguideId, userId: user?.id ?? '' })
  const stop = stops[index]

  // Al cambiar de parada, el <audio> se remonta (key={stop.id}): reinicia
  // tiempos/estado de la anterior, pero mantiene la velocidad elegida.
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id])

  function applyRemote(state: AudioguideSyncState) {
    const el = audioRef.current
    if (!el) return
    applyingRemoteRef.current = true
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

  if (!stop) return null

  const broadcastIfJoined = (playing: boolean) => {
    if (!group.joined || applyingRemoteRef.current || !audioRef.current) return
    group.sendState({
      stopId: stop.id,
      positionSeconds: audioRef.current.currentTime,
      isPlaying: playing,
      playbackRate: audioRef.current.playbackRate,
    })
  }

  const goTo = (i: number) => {
    const target = stops[i]
    if (!target) return
    setIndex(i)
    setShowIndex(false)
    if (group.joined) {
      const state: AudioguideSyncState = {
        stopId: target.id, positionSeconds: 0, isPlaying: true, playbackRate, sentAt: Date.now(),
      }
      pendingRemoteRef.current = state
      group.sendState(state)
    }
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  const skip = (deltaSeconds: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(0, el.currentTime + deltaSeconds), el.duration || Infinity)
  }

  const cycleRate = () => {
    const nextRate = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) audioRef.current.playbackRate = nextRate
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

  return (
    <div className="space-y-3">
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
            <audio
              key={stop.id}
              ref={audioRef}
              className="sr-only"
              preload="metadata"
              src={stop.audio_url}
              onPlay={() => { setIsPlaying(true); broadcastIfJoined(true) }}
              onPause={() => { setIsPlaying(false); broadcastIfJoined(false) }}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
              onSeeked={() => broadcastIfJoined(!!audioRef.current && !audioRef.current.paused)}
              onLoadedMetadata={() => {
                setDuration(audioRef.current?.duration ?? 0)
                if (pendingRemoteRef.current) {
                  applyRemote(pendingRemoteRef.current)
                  pendingRemoteRef.current = null
                }
              }}
            />

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
            onClick={() => goTo(Math.max(0, index - 1))}
            disabled={index === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-md border border-border disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(stops.length - 1, index + 1))}
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

        {showIndex && (
          <div className="space-y-1 max-h-72 overflow-y-auto px-3 pb-3">
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
