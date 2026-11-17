import { useMemo } from 'react'
import { Headphones } from 'lucide-react'
import { Row, RowList, Spinner } from '@/design'
import { useAudioguide } from '@/lib/queries/audioguides'
import { scopeRoute, type AudioguideScope } from '@/lib/audioguide/scope'
import type { Activity } from '@/types/database'

interface Props {
  activity: Activity
  tripId: string
  /** Quien solo mira el viaje no ve la invitación a crearla. */
  canEdit?: boolean
}

// Punto de entrada a la audioguía desde el detalle de la actividad: crear el
// guion, generar los audios y el reproductor viven en su propia pantalla
// (AudioguidePage).
export function AudioguideEntryCard({ activity, tripId, canEdit = true }: Props) {
  const scope = useMemo<AudioguideScope>(() => ({ kind: 'activity', id: activity.id }), [activity.id])
  const { data: audioguide, isLoading } = useAudioguide(scope)
  if (isLoading) return null

  const stops = audioguide?.stops ?? []
  const allReady = stops.length > 0 && stops.every((s) => s.status === 'ready')
  const generating = !!audioguide && !allReady
  if (!audioguide && !canEdit) return null

  return (
    <RowList>
      <Row
        icon={Headphones}
        tone="primary"
        title="Audioguía"
        subtitle={
          allReady ? `${stops.length} paradas listas para escuchar`
            : generating ? 'Creando los audios…'
              : 'Crea una audioguía para visitar este sitio'
        }
        trailing={generating ? <Spinner className="size-4" label="Creando" /> : undefined}
        to={scopeRoute(tripId, scope)}
        chevron={!generating}
      />
    </RowList>
  )
}
