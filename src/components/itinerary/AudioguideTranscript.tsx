import { useEffect, useMemo, useRef, useState } from 'react'
import type { AudioguideStop } from '@/types/database'
import { cn } from '@/lib/utils'
import {
  activeSentenceIndex, estimateTimings, splitSentences, type SentenceTiming,
} from '@/lib/audioguide/sentences'

interface Props {
  stop: AudioguideStop
  currentTime: number
  isPlaying: boolean
  onSeek?: (seconds: number) => void
}

// Guion de la parada, frase a frase, con la que está sonando resaltada
// (estilo letras de Spotify) y auto-scroll para mantenerla centrada. Si el
// usuario scrollea a mano, dejamos de seguir la reproducción y mostramos un
// botón para volver a centrarla. También sirve como lectura sin audio: sin
// timings ni reproducción, es simplemente el guion completo legible.
// El padre remonta este componente al cambiar de parada (key={stop.id}).
export function AudioguideTranscript({ stop, currentTime, isPlaying, onSeek }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoFollow, setAutoFollow] = useState(true)

  // Fuente de los tiempos: los timepoints reales de Google TTS si existen;
  // si no (audio antiguo), estimación proporcional a la longitud de cada
  // frase; sin audio, no hay tiempos y la transcripción es solo lectura.
  const timings = useMemo<SentenceTiming[] | null>(() => {
    if (stop.sentence_timings?.length) return stop.sentence_timings
    const duration = Number(stop.audio_duration_seconds)
    if (stop.audio_url && duration > 0) return estimateTimings(stop.script_text, duration)
    return null
  }, [stop])

  const sentences = useMemo(
    () => timings?.map((t) => t.text) ?? splitSentences(stop.script_text),
    [timings, stop.script_text],
  )

  const started = isPlaying || currentTime > 0
  const activeIndex = timings && started ? activeSentenceIndex(timings, currentTime) : -1

  const scrollToActive = (behavior: ScrollBehavior) => {
    const container = containerRef.current
    const el = container?.querySelector<HTMLElement>('[data-active="true"]')
    if (!container || !el) return
    container.scrollTo({
      top: el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2,
      behavior,
    })
  }

  useEffect(() => {
    if (autoFollow && activeIndex >= 0) scrollToActive('smooth')
  }, [activeIndex, autoFollow])

  const stopFollowing = () => setAutoFollow(false)

  return (
    <div
      ref={containerRef}
      onWheel={stopFollowing}
      onTouchMove={stopFollowing}
      className="relative max-h-72 overflow-y-auto rounded-lg px-3 py-2.5"
      style={{ background: 'var(--secondary)' }}
    >
      <p className="text-[15px] leading-relaxed">
        {sentences.map((sentence, i) => {
          const seekable = !!onSeek && !!timings
          const Tag = seekable ? 'button' : 'span'
          return (
            <Tag
              key={i}
              {...(seekable ? { type: 'button' as const, onClick: () => { setAutoFollow(true); onSeek(timings[i].start) } } : {})}
              data-active={i === activeIndex || undefined}
              className={cn(
                'text-left transition-colors duration-300',
                activeIndex === -1
                  ? 'text-foreground'
                  : i === activeIndex
                    ? 'font-medium'
                    : 'text-muted-foreground opacity-60',
              )}
              style={i === activeIndex ? { color: 'var(--primary)' } : undefined}
            >
              {sentence}{' '}
            </Tag>
          )
        })}
      </p>

      {!autoFollow && activeIndex >= 0 && (
        <div className="sticky bottom-1 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => { setAutoFollow(true); scrollToActive('smooth') }}
            className="pointer-events-auto text-xs font-medium px-3 py-1.5 rounded-full text-white shadow-md"
            style={{ background: 'var(--primary)' }}
          >
            Volver a la frase actual
          </button>
        </div>
      )}
    </div>
  )
}
