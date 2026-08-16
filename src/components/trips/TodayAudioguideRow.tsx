import { Link } from 'react-router-dom'
import { ChevronRight, Headphones } from 'lucide-react'
import { useTripAudioguidesReadiness } from '@/lib/queries/audioguides'
import { scopeRoute } from '@/lib/audioguide/scope'
import { audioguiaDeAhora } from '@/lib/audioguide/ahora'
import type { DayEntry } from '@/lib/today'
import type { ItineraryDay } from '@/types/database'

interface Props {
  tripId: string
  /** El día de hoy del itinerario, para su audioguía de ciudad. */
  todayDay: ItineraryDay | undefined
  /** Lo que estás haciendo ahora (o lo siguiente), tal y como lo elige focusEntry. */
  focus: DayEntry | null
}

// La audioguía que toca escuchar ahora mismo, a un toque desde el centro del
// día, sin tener que entrar al itinerario y buscar la actividad. Cuál es la que
// toca lo decide audioguiaDeAhora, que está aparte por ser lo único con reglas.
export function TodayAudioguideRow({ tripId, todayDay, focus }: Props) {
  const { data: readiness } = useTripAudioguidesReadiness(tripId)
  const cual = audioguiaDeAhora(readiness, focus, todayDay)
  if (!cual) return null

  return (
    <Link
      to={scopeRoute(tripId, cual.scope)}
      className="flex items-center gap-3 p-3 rounded-xl mb-3 transition-colors hover:border-primary"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
      >
        <Headphones size={17} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">Audioguía · {cual.titulo}</span>
        <span className="block text-xs text-muted-foreground truncate">{cual.pie}</span>
      </span>
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
    </Link>
  )
}
