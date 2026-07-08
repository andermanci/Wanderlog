import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Navigation, Users } from 'lucide-react'
import type { AudioguideStop } from '@/types/database'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useAudioguideGroupPlayback, type AudioguideSyncState } from '@/lib/realtime/useAudioguideGroupPlayback'

interface Props {
  stops: AudioguideStop[]
  audioguideId: string
}

// Reproductor paso a paso: un índice con título + resumen de cada parada
// para decidir qué escuchar, y debajo la parada seleccionada con su
// indicación de dirección y el audio nativo del navegador. Si te unes al
// grupo, tus acciones (play/pausa/salto) se emiten a los demás dispositivos
// del viaje y las suyas se aplican aquí.
export function AudioguidePlayer({ stops, audioguideId }: Props) {
  const { user } = useAuthStore()
  const [index, setIndex] = useState(0)
  const [showIndex, setShowIndex] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)
  const applyingRemoteRef = useRef(false)
  const pendingRemoteRef = useRef<AudioguideSyncState | null>(null)

  const group = useAudioguideGroupPlayback({ audioguideId, userId: user?.id ?? '' })
  const stop = stops[index]

  function applyRemote(state: AudioguideSyncState) {
    const el = audioRef.current
    if (!el) return
    applyingRemoteRef.current = true
    const elapsed = state.isPlaying ? (Date.now() - state.sentAt) / 1000 : 0
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

  const broadcastIfJoined = (isPlaying: boolean) => {
    if (!group.joined || applyingRemoteRef.current || !audioRef.current) return
    group.sendState({ stopId: stop.id, positionSeconds: audioRef.current.currentTime, isPlaying })
  }

  const goTo = (i: number) => {
    const target = stops[i]
    if (!target) return
    setIndex(i)
    setShowIndex(false)
    if (group.joined) {
      const state: AudioguideSyncState = { stopId: target.id, positionSeconds: 0, isPlaying: true, sentAt: Date.now() }
      pendingRemoteRef.current = state
      group.sendState(state)
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
      <div className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: 'var(--secondary)' }}>
        <div className="flex items-center gap-1.5 text-sm">
          <Users size={14} />
          {group.joined
            ? <span>{group.participantCount} escuchando en grupo</span>
            : <span className="text-muted-foreground">Escucha en solitario</span>}
        </div>
        <button
          type="button"
          onClick={handleToggleGroup}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:border-primary/50 transition-colors"
        >
          {group.joined ? 'Salir del grupo' : 'Unirse al grupo'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowIndex((v) => !v)}
        className="w-full flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest"
      >
        <span>Índice de paradas ({stops.length})</span>
        <ChevronDown size={14} className={cn('transition-transform', showIndex && 'rotate-180')} />
      </button>

      {showIndex && (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {stops.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                'w-full text-left rounded-md p-2 border transition-colors',
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

      <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest">
        <span>Parada {index + 1} de {stops.length}</span>
      </div>

      <div className="rounded-lg p-3" style={{ background: 'var(--secondary)' }}>
        <p className="font-serif text-base mb-1">{stop.title}</p>
        {stop.summary && (
          <p className="text-sm text-muted-foreground mb-2">{stop.summary}</p>
        )}
        {stop.direction_text && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <Navigation size={13} className="mt-0.5 shrink-0" />
            <span>{stop.direction_text}</span>
          </p>
        )}
      </div>

      {stop.audio_url ? (
        <audio
          key={stop.id}
          ref={audioRef}
          controls
          className="w-full"
          src={stop.audio_url}
          onPlay={() => broadcastIfJoined(true)}
          onPause={() => broadcastIfJoined(false)}
          onSeeked={() => broadcastIfJoined(!!audioRef.current && !audioRef.current.paused)}
          onLoadedMetadata={() => {
            if (pendingRemoteRef.current) {
              applyRemote(pendingRemoteRef.current)
              pendingRemoteRef.current = null
            }
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Audio no disponible.</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Anterior
        </button>
        <button
          type="button"
          onClick={() => goTo(Math.min(stops.length - 1, index + 1))}
          disabled={index === stops.length - 1}
          className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border disabled:opacity-40"
        >
          Siguiente <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
