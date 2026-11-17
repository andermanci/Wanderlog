import { Headphones } from 'lucide-react'
import { Row, RowList } from '@/design'
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

// La audioguía que toca escuchar ahora mismo, a un toque desde el Inicio del
// viaje, sin tener que entrar al plan y buscar la actividad. Cuál es la que
// toca lo decide audioguiaDeAhora, que está aparte por ser lo único con reglas.
// Si no hay ninguna lista para escuchar, no pinta nada.
export function TodayAudioguideRow({ tripId, todayDay, focus }: Props) {
  const { data: readiness } = useTripAudioguidesReadiness(tripId)
  const cual = audioguiaDeAhora(readiness, focus, todayDay)
  if (!cual) return null

  return (
    <RowList>
      <Row
        icon={Headphones}
        tone="primary"
        title={`Audioguía · ${cual.titulo}`}
        subtitle={cual.pie}
        to={scopeRoute(tripId, cual.scope)}
        chevron
      />
    </RowList>
  )
}
