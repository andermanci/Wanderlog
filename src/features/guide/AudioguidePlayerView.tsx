import { useRef, useState } from 'react'
import {
  ChevronDown, Headphones, Map as MapIcon, MapPin, Navigation, Pause, Play,
  RotateCcw, RotateCw, ScrollText, SkipBack, SkipForward, Users,
} from 'lucide-react'
import { Badge, Button, Card, Chip, IconButton, Section, Spinner } from '@/design'
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div ref={topRef} className="min-w-0 scroll-mt-4 space-y-5">
        {/* Qué estás mirando. Dentro de un museo, «la gran tabla horizontal
            dominada por un jardín» resuelve poco delante de una pared con seis
            cuadros parecidos; la foto lo resuelve de un vistazo.
            object-contain y no cover: recortar una obra por el centro es
            justo lo que impide reconocerla. La imagen se sirve ya reducida
            desde nuestro propio almacén, así que la cachea el service worker
            y se ve sin conexión. */}
        <figure className="m-0">
          <div className="relative grid aspect-[4/3] max-h-[46dvh] w-full place-items-center overflow-hidden rounded-3xl bg-sunken">
            {stopImage ? (
              <img src={stopImage} alt={`Imagen de ${stop.title}`} className="size-full object-contain" />
            ) : coverUrl ? (
              <>
                <img src={coverUrl} alt="" className="size-full object-cover" />
                <div aria-hidden="true" className="absolute inset-0 photo-scrim" />
              </>
            ) : (
              <Headphones className="size-14 text-muted-foreground/50" aria-hidden="true" />
            )}
            <span className="on-photo absolute left-3 top-3 inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold">
              Parada {index + 1} de {stops.length}
            </span>
          </div>
          {stopImage && stop.image_credit && (
            <figcaption className="mt-1.5 text-right text-2xs text-muted-foreground">{stop.image_credit}</figcaption>
          )}
        </figure>

        <div>
          <h2 className="title-page">{stop.title}</h2>
          {stop.summary && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{stop.summary}</p>}
          {stop.direction_text && (
            <p className="mt-3 flex items-start gap-2 text-[0.9375rem] leading-relaxed">
              <Navigation className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span><span className="sr-only">Cómo llegar: </span>{stop.direction_text}</span>
            </p>
          )}
          {locatingStops && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" label="Situando las paradas en el mapa" /> Situando las paradas en el mapa…
            </p>
          )}
        </div>

        {stop.audio_url ? (
          <div className="space-y-4">
            <div>
              <input
                type="range"
                min={0}
                max={p.duration || 0}
                step={0.1}
                value={Math.min(p.currentTime, p.duration || 0)}
                onChange={(e) => p.seek(Number(e.target.value))}
                className="block h-6 w-full cursor-pointer accent-primary"
                aria-label="Progreso del audio"
                aria-valuetext={`${formatTime(p.currentTime)} de ${formatTime(p.duration)}`}
              />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{formatTime(p.currentTime)}</span>
                <span>{formatTime(p.duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <IconButton
                label="Parada anterior" disabled={isFirst}
                onClick={() => p.goTo(Math.max(0, index - 1), { autoPlay: p.isActuallyPlaying() })}
              >
                <SkipBack />
              </IconButton>
              <IconButton label="Retroceder 15 segundos" variant="secondary" size="lg" onClick={() => p.skip(-15)}>
                <span className="flex flex-col items-center gap-0.5">
                  <RotateCcw className="size-5!" />
                  <span aria-hidden="true" className="text-2xs font-semibold leading-none">15 s</span>
                </span>
              </IconButton>
              <IconButton
                label={p.isPlaying ? 'Pausar' : 'Reproducir'} variant="primary" size="lg"
                className="size-18 [&_svg]:size-8"
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
                <SkipForward />
              </IconButton>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-sunken px-4 py-3 text-sm text-muted-foreground">
            Esta parada no tiene audio. Puedes leer su guion aquí abajo.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {stop.audio_url && (
            <Button variant="outline" onClick={p.cycleRate} aria-label={`Velocidad: ${p.playbackRate}×. Cambiar`}>
              Velocidad {p.playbackRate}×
            </Button>
          )}
          <Chip
            icon={ScrollText} selected={showTranscript}
            onClick={() => setShowTranscript(v => !v)} className="h-11 px-5"
          >
            Guion
          </Chip>
          {p.hasMap && (
            <Button variant="outline" onClick={() => p.openMap(index)}>
              <MapIcon /> Mapa
            </Button>
          )}
        </div>

        {showTranscript && (
          <Transcript
            key={stop.id}
            stop={stop}
            currentTime={p.currentTime}
            isPlaying={p.isPlaying}
            onSeek={stop.audio_url ? p.seek : undefined}
          />
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <Card pad="sm" className="flex items-center gap-3">
          <span data-tone={p.groupJoined ? 'success' : 'neutral'} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-medium">
              {p.groupJoined
                ? `${p.groupCount} ${p.groupCount === 1 ? 'persona' : 'personas'} en el grupo`
                : 'Escuchar en grupo'}
            </p>
            <p className="text-sm text-muted-foreground">
              {p.groupJoined
                ? 'Lo que hagas (pausar, saltar) pasa en todos los móviles.'
                : 'Todos oís lo mismo a la vez, cada uno en su móvil.'}
            </p>
          </div>
          <Button size="sm" variant={p.groupJoined ? 'outline' : 'soft'} onClick={p.handleToggleGroup}>
            {p.groupJoined ? 'Salir' : 'Unirme'}
          </Button>
        </Card>

        <Section
          title={`Paradas (${stops.length})`}
          action={
            <Button
              size="sm" variant="ghost" aria-expanded={p.showIndex}
              onClick={() => p.setShowIndex(v => !v)}
            >
              {p.showIndex ? 'Ocultar' : 'Ver todas'}
              <ChevronDown className={cn('transition-transform duration-200', p.showIndex && 'rotate-180')} />
            </Button>
          }
        >
          {/* La lista crece entera y scrolla la página. Con su propio scroll el
              gesto se lo quedaba el contenedor de fuera en móvil y no había
              manera de recorrer las paradas. */}
          {p.showIndex && (
            <Card pad="none" className="divide-y divide-border overflow-hidden">
              {/* Fila = contenedor con DOS botones hermanos (ir a la parada y
                  verla en el mapa): un botón dentro de otro no es HTML válido. */}
              {stops.map((s, i) => {
                const actual = i === index
                return (
                  <div key={s.id} className={cn('flex items-stretch', actual && 'bg-primary-soft')}>
                    <button
                      type="button"
                      onClick={() => elegirParada(i)}
                      aria-current={actual ? 'true' : undefined}
                      className="flex min-h-15 min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/70"
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                          actual ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium text-foreground">{s.title}</span>
                        {s.summary && <span className="mt-0.5 block text-sm text-muted-foreground">{s.summary}</span>}
                        {actual && <Badge tone="primary" className="mt-1.5">{p.isPlaying ? 'Sonando' : 'Estás aquí'}</Badge>}
                      </span>
                    </button>
                    {p.hasMap && stopPoint(s) && (
                      <div className="flex shrink-0 items-center pr-2">
                        <IconButton label={`Ver «${s.title}» en el mapa`} onClick={() => p.openMap(i)}>
                          <MapPin />
                        </IconButton>
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>
          )}
        </Section>
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
