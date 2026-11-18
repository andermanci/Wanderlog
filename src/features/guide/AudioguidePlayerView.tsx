import { useRef, useState } from 'react'
import {
  ChevronDown, Map as MapIcon, MapPin, Navigation, Pause, Play,
  RotateCcw, RotateCw, ScrollText, SkipBack, SkipForward, Users, Volume2,
} from 'lucide-react'
import { Button, Chip, IconButton, Spinner } from '@/design'
import { cn } from '@/lib/utils'
import { mediaUrl } from '@/lib/mediaUrl'
import { stopPoint } from '@/lib/queries/audioguideStopLocations'
import { formatTime, type AudioguidePlayback } from './useAudioguidePlayback'
import { Transcript } from './Transcript'
import { StopsMapModal } from './StopsMapModal'

interface Props {
  /** Lo que devuelve useAudioguidePlayback (llega por el almacén del reproductor). */
  playback: AudioguidePlayback
  /** Foto de reserva cuando la parada no tiene la suya. */
  coverUrl: string | null
  /** Se están localizando las paradas en segundo plano. */
  locatingStops?: boolean
}

/**
 * La cara del reproductor. No tiene lógica de audio: todo lo que hace es
 * llamar, desde el propio toque, a las funciones del reproductor.
 */
export function AudioguidePlayerView({ playback: p, coverUrl, locatingStops }: Props) {
  const [showTranscript, setShowTranscript] = useState(true)
  const topRef = useRef<HTMLDivElement>(null)
  const { stop, stops, index } = p
  if (!stop) return null

  const stopImage = mediaUrl(stop.image_url)
  const isFirst = index === 0
  const isLast = index === stops.length - 1

  // Elegir una parada en el índice te sube al reproductor, que es donde está lo
  // que acabas de elegir (el índice queda debajo y puede ser largo).
  const elegirParada = (i: number) => {
    p.goTo(i)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Duración de cada pista y del total. El total solo se dice si todas las
  // paradas la traen: una suma a medias engaña.
  const segundos = (d: number | null) => Number(d) || 0
  const total = stops.reduce((n, s) => n + segundos(s.audio_duration_seconds), 0)
  const totalFiable = stops.every(s => segundos(s.audio_duration_seconds) > 0)

  const max = p.duration || 0
  const now = Math.min(p.currentTime, max)
  const percent = max > 0 ? (now / max) * 100 : 0

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
      {/* Carátula y controles. En escritorio se quedan a la vista mientras lees o eliges parada. */}
      <div
        ref={topRef}
        className="min-w-0 scroll-mt-4 space-y-6 lg:sticky lg:top-28 lg:-m-1 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:p-1 no-scrollbar"
      >
        {/* Qué estás mirando. Dentro de un museo, «la gran tabla horizontal
            dominada por un jardín» resuelve poco delante de una pared con seis
            cuadros parecidos; la foto lo resuelve de un vistazo.
            object-contain y no cover: recortar una obra por el centro es
            justo lo que impide reconocerla. La imagen se sirve ya reducida
            desde nuestro propio almacén, así que la cachea el service worker
            y se ve sin conexión.
            Sin foto de la parada, la carátula es su número. */}
        <figure className="m-0">
          <div
            className={cn(
              'relative grid aspect-[4/3] max-h-[44dvh] w-full place-items-center overflow-hidden rounded-3xl shadow-raised lg:aspect-square lg:max-h-[40dvh]',
              stopImage ? 'bg-sunken' : 'bg-primary-soft',
            )}
          >
            {stopImage ? (
              <img src={stopImage} alt={`Imagen de ${stop.title}`} className="size-full object-contain" />
            ) : (
              <>
                {coverUrl && (
                  <>
                    <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
                    <div aria-hidden="true" className="absolute inset-0 photo-scrim" />
                  </>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative font-serif text-9xl font-medium leading-none tracking-tight tabular-nums',
                    coverUrl ? 'text-white' : 'text-accent-foreground',
                  )}
                >
                  {index + 1}
                </span>
              </>
            )}
          </div>
          {stopImage && stop.image_credit && (
            <figcaption className="mt-1.5 text-right text-2xs text-muted-foreground">{stop.image_credit}</figcaption>
          )}
        </figure>

        <div className="text-center lg:text-left">
          <p className="eyebrow tabular-nums">Parada {index + 1} de {stops.length}</p>
          <h2 className="mt-1.5 font-serif text-3xl font-medium leading-tight tracking-tight">{stop.title}</h2>
          {stop.summary && <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{stop.summary}</p>}
          {stop.direction_text && (
            <p className="mt-3 flex items-start gap-2 text-left text-[0.9375rem] leading-relaxed">
              <Navigation className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span><span className="sr-only">Cómo llegar: </span>{stop.direction_text}</span>
            </p>
          )}
          {locatingStops && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start">
              <Spinner className="size-4" label="Situando las paradas en el mapa" /> Situando las paradas en el mapa…
            </p>
          )}
        </div>

        {stop.audio_url ? (
          <div className="space-y-5">
            <div>
              {/* Barra gruesa pintada a mano; encima, invisible, el control nativo, que es quien manda. */}
              <div className="relative h-8 rounded-full has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30">
                <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <div aria-hidden="true" className="absolute inset-x-2.5 top-1/2">
                  <span
                    className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-card"
                    style={{ left: `${percent}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={0.1}
                  value={now}
                  onChange={(e) => p.seek(Number(e.target.value))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Progreso del audio"
                  aria-valuetext={`${formatTime(p.currentTime)} de ${formatTime(p.duration)}`}
                />
              </div>
              <div className="flex justify-between text-sm font-medium tabular-nums text-muted-foreground">
                <span>{formatTime(p.currentTime)}</span>
                <span>{formatTime(p.duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <IconButton
                label="Parada anterior" disabled={isFirst}
                onClick={() => p.goTo(Math.max(0, index - 1), { autoPlay: p.isActuallyPlaying() })}
              >
                <SkipBack fill="currentColor" />
              </IconButton>
              <IconButton label="Retroceder 15 segundos" variant="secondary" size="lg" onClick={() => p.skip(-15)}>
                <span className="flex flex-col items-center gap-0.5">
                  <RotateCcw className="size-5!" />
                  <span aria-hidden="true" className="text-2xs font-semibold leading-none">15 s</span>
                </span>
              </IconButton>
              <IconButton
                label={p.isPlaying ? 'Pausar' : 'Reproducir'} variant="primary" size="lg"
                className="size-20 shadow-raised ring-4 ring-primary/15 [&_svg]:size-9"
                onClick={p.togglePlay}
              >
                {p.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
              </IconButton>
              <IconButton label="Avanzar 15 segundos" variant="secondary" size="lg" onClick={() => p.skip(15)}>
                <span className="flex flex-col items-center gap-0.5">
                  <RotateCw className="size-5!" />
                  <span aria-hidden="true" className="text-2xs font-semibold leading-none">15 s</span>
                </span>
              </IconButton>
              <IconButton
                label="Parada siguiente" disabled={isLast}
                onClick={() => p.goTo(Math.min(stops.length - 1, index + 1), { autoPlay: p.isActuallyPlaying() })}
              >
                <SkipForward fill="currentColor" />
              </IconButton>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-sunken px-4 py-3 text-sm text-muted-foreground">
            Esta parada no tiene audio. Puedes leer su guion aquí abajo.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {stop.audio_url && (
              <Chip onClick={p.cycleRate} className="h-11 px-4 tabular-nums">
                <span className="sr-only">Cambiar la velocidad. Ahora: </span>Velocidad {p.playbackRate}×
              </Chip>
            )}
            <Chip icon={Users} selected={p.groupJoined} onClick={p.handleToggleGroup} className="h-11 px-4">
              {p.groupJoined ? `En grupo · ${p.groupCount}` : 'Escuchar en grupo'}
            </Chip>
            <Chip
              icon={ScrollText} selected={showTranscript}
              onClick={() => setShowTranscript(v => !v)} className="h-11 px-4"
            >
              Guion
            </Chip>
            {p.hasMap && (
              <Chip icon={MapIcon} onClick={() => p.openMap(index)} className="h-11 px-4">Mapa</Chip>
            )}
          </div>
          <p className="mt-2.5 text-center text-xs leading-relaxed text-muted-foreground lg:text-left">
            {p.groupJoined
              ? `${p.groupCount} ${p.groupCount === 1 ? 'persona' : 'personas'} en el grupo. Lo que hagas (pausar, saltar) pasa en todos los móviles. Toca «En grupo» para salir.`
              : 'En grupo, todos oís lo mismo a la vez, cada uno en su móvil.'}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-10">
        {showTranscript && (
          <section aria-label="Guion de la parada">
            <h3 className="eyebrow mb-3">Guion de la parada</h3>
            <Transcript
              key={stop.id}
              stop={stop}
              currentTime={p.currentTime}
              isPlaying={p.isPlaying}
              onSeek={stop.audio_url ? p.seek : undefined}
            />
          </section>
        )}

        <section aria-label="Paradas">
          <header className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="title-section">Paradas</h3>
              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                {stops.length} {stops.length === 1 ? 'parada' : 'paradas'}
                {totalFiable && total > 0 ? ` · ${Math.max(1, Math.round(total / 60))} min` : ''}
              </p>
            </div>
            <Button
              size="sm" variant="ghost" aria-expanded={p.showIndex}
              onClick={() => p.setShowIndex(v => !v)}
            >
              {p.showIndex ? 'Ocultar' : 'Ver todas'}
              <ChevronDown className={cn('transition-transform duration-200', p.showIndex && 'rotate-180')} />
            </Button>
          </header>

          {/* La lista crece entera y scrolla la página. Con su propio scroll el
              gesto se lo quedaba el contenedor de fuera en móvil y no había
              manera de recorrer las paradas. */}
          {p.showIndex && (
            <ol className="mt-3 border-t border-border">
              {/* Fila = contenedor con DOS botones hermanos (ir a la parada y
                  verla en el mapa): un botón dentro de otro no es HTML válido. */}
              {stops.map((s, i) => {
                const actual = i === index
                const dur = segundos(s.audio_duration_seconds)
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-stretch border-b border-border',
                      actual && '-mx-2 rounded-xl border-transparent bg-primary-soft px-2',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => elegirParada(i)}
                      aria-current={actual ? 'true' : undefined}
                      className="group flex min-h-14 min-w-0 flex-1 items-start gap-3 py-3 text-left"
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center font-serif text-base tabular-nums',
                          actual ? 'rounded-full bg-primary text-primary-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {actual && p.isPlaying ? <Volume2 className="size-4" aria-hidden="true" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        {actual && (
                          <span className="eyebrow block text-accent-foreground">{p.isPlaying ? 'Sonando' : 'Estás aquí'}</span>
                        )}
                        <span
                          className={cn(
                            'block font-serif text-lg font-medium leading-snug tracking-tight group-hover:underline group-hover:underline-offset-4',
                            actual ? 'text-accent-foreground' : 'text-foreground',
                          )}
                        >
                          {actual && p.isPlaying && <span className="sr-only">Parada {i + 1}: </span>}
                          {s.title}
                        </span>
                        {s.summary && <span className="mt-0.5 block text-sm text-muted-foreground">{s.summary}</span>}
                      </span>
                      {dur > 0 && (
                        <span className="mt-1 shrink-0 text-sm tabular-nums text-muted-foreground">{formatTime(dur)}</span>
                      )}
                    </button>
                    {p.hasMap && stopPoint(s) && (
                      <div className="flex shrink-0 items-center pl-1">
                        <IconButton label={`Ver «${s.title}» en el mapa`} onClick={() => p.openMap(i)}>
                          <MapPin />
                        </IconButton>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <StopsMapModal
        open={p.mapFocusIndex !== null}
        onOpenChange={(o) => { if (!o) p.closeMap() }}
        stops={stops}
        activeIndex={index}
        focusIndex={p.mapFocusIndex ?? index}
        onSelectStop={(i) => p.goTo(i, { autoPlay: p.isActuallyPlaying() })}
      />
    </div>
  )
}
