import { Link, useLocation } from 'react-router-dom'
import { Headphones, Pause, Play, X } from 'lucide-react'
import { IconButton } from '@/design'
import { mediaUrl } from '@/lib/mediaUrl'
import { PlaybackHost } from './PlaybackHost'
import { usePlaybackStore } from './playbackStore'

/**
 * Barra pequeña de la audioguía en curso. Va montada UNA vez en el armazón:
 * además de pintar la barra, trae consigo al dueño del audio (PlaybackHost),
 * que es lo que permite que siga sonando al cambiar de pantalla.
 *
 * La barra solo se ve cuando hay una audioguía cargada y NO estás en su
 * pantalla de reproductor. Tocarla te devuelve a él.
 */
export function MiniPlayer() {
  return (
    <>
      <PlaybackHost primary />
      <MiniPlayerBar />
    </>
  )
}

function MiniPlayerBar() {
  const { pathname } = useLocation()
  const session = usePlaybackStore(s => s.session)
  // Selectores finos: el reproductor se repinta cuatro veces por segundo y
  // esta barra solo necesita enterarse de lo que enseña.
  const listo = usePlaybackStore(s => !!s.api && s.api.audioguideId === s.session?.audioguideId)
  const isPlaying = usePlaybackStore(s => s.api?.isPlaying ?? false)
  const stopTitle = usePlaybackStore(s => s.api?.stop?.title ?? null)
  const stopImage = usePlaybackStore(s => s.api?.stop?.image_url ?? null)
  const stopNumber = usePlaybackStore(s => (s.api ? s.api.index + 1 : 0))
  const percent = usePlaybackStore(s =>
    s.api && s.api.duration > 0 ? Math.round((s.api.currentTime / s.api.duration) * 100) : 0)

  if (!session || !listo || pathname === session.route) return null

  const imagen = mediaUrl(stopImage) ?? session.coverUrl

  // Se leen del almacén EN el toque, no en el render: así se llama siempre a la
  // función del último pintado del reproductor, dentro del gesto (iOS).
  const togglePlay = () => usePlaybackStore.getState().api?.togglePlay()
  const cerrar = () => {
    const { api, close } = usePlaybackStore.getState()
    if (api?.isActuallyPlaying()) api.togglePlay()
    close()
  }

  return (
    <aside
      aria-label="Audioguía en curso"
      className={[
        'no-print fixed z-30 overflow-hidden rounded-2xl border border-border bar-glass shadow-float animate-rise',
        // Móvil: sobre la barra inferior, dejando sitio al botón «+» de la derecha.
        'left-4 right-[5.25rem] bottom-[calc(env(safe-area-inset-bottom)+5rem)]',
        // Escritorio: abajo a la derecha.
        'md:left-auto md:right-6 md:bottom-6 md:w-96',
      ].join(' ')}
    >
      <div className="flex h-14 items-center gap-1 pr-1.5">
        <Link
          to={session.route}
          aria-label={`Volver a la audioguía: ${stopTitle ?? session.title}`}
          className="flex h-full min-w-0 flex-1 items-center gap-3 pl-2 pr-1 transition-colors duration-150 hover:bg-secondary/70"
        >
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-accent-foreground">
            {imagen
              ? <img src={imagen} alt="" className="size-full object-cover" />
              : <Headphones className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{stopTitle ?? session.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              Parada {stopNumber} de {session.stops.length} · {session.title}
            </span>
          </span>
        </Link>
        <IconButton label={isPlaying ? 'Pausar' : 'Reproducir'} variant="primary" onClick={togglePlay}>
          {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </IconButton>
        {/* Cerrar solo en pausa: mientras suena, ese hueco es para el título. */}
        {!isPlaying && (
          <IconButton label="Cerrar la audioguía" size="sm" onClick={cerrar}>
            <X />
          </IconButton>
        )}
      </div>
      {/* Avance de la parada: un hilo, sin controles (para eso está el reproductor). */}
      <div aria-hidden="true" className="h-0.5 bg-secondary">
        <div className="h-full bg-primary transition-[width] duration-500 ease-linear" style={{ width: `${percent}%` }} />
      </div>
    </aside>
  )
}
