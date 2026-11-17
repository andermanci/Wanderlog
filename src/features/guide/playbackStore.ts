import { create } from 'zustand'
import type { AudioguideStop } from '@/types/database'
import type { AudioguidePlayback } from './useAudioguidePlayback'

/** La audioguía que está cargada en el reproductor (suene o esté en pausa). */
export interface PlaybackSession {
  audioguideId: string
  stops: AudioguideStop[]
  /** De qué es la audioguía: el sitio o la ciudad del día. */
  title: string
  /** Portada para la pantalla de bloqueo y la barra pequeña. */
  coverUrl: string | null
  /** Ruta de su pantalla de reproductor, para volver a ella. */
  route: string
}

// El reproductor vive FUERA de la pantalla de la audioguía para que el audio
// siga sonando al navegar por la app. Aquí está lo que comparten sus tres
// piezas:
//   · PlaybackHost monta los <audio> y ejecuta useAudioguidePlayback para la
//     `session`, y publica en `api` lo que devuelve el hook en cada render.
//   · AudioguidePage abre la sesión y pinta el reproductor grande leyendo `api`.
//   · MiniPlayer pinta la barra pequeña leyendo `api`.
interface PlaybackState {
  session: PlaybackSession | null
  api: AudioguidePlayback | null
  /** Cuántos anfitriones fijos (el del armazón) hay montados. */
  primaryHosts: number
  /** Carga una audioguía en el reproductor (o actualiza sus datos si ya es esa). */
  open: (session: PlaybackSession) => void
  /** Descarga la audioguía: el audio se para y la barra pequeña desaparece. */
  close: (audioguideId?: string) => void
  setApi: (api: AudioguidePlayback | null) => void
  addPrimaryHost: (delta: 1 | -1) => void
}

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  session: null,
  api: null,
  primaryHosts: 0,
  open: next => {
    const prev = get().session
    // Lo llama un efecto en cada cambio de datos: si no ha cambiado nada, no se
    // toca el estado (evita renders en cadena entre la página y el anfitrión).
    if (
      prev && prev.audioguideId === next.audioguideId && prev.stops === next.stops
      && prev.title === next.title && prev.coverUrl === next.coverUrl && prev.route === next.route
    ) return
    set({ session: next })
  },
  close: audioguideId => {
    const prev = get().session
    if (!prev || (audioguideId && prev.audioguideId !== audioguideId)) return
    set({ session: null })
  },
  setApi: api => set({ api }),
  addPrimaryHost: delta => set(s => ({ primaryHosts: Math.max(0, s.primaryHosts + delta) })),
}))
