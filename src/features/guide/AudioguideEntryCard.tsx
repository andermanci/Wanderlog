import { useMemo } from 'react'
import { Headphones } from 'lucide-react'
import { Spinner } from '@/design'
import { useAudioguide } from '@/lib/queries/audioguides'
import { scopeRoute, type AudioguideScope } from '@/lib/audioguide/scope'
import type { Activity } from '@/types/database'
import { TrackRow } from './TrackRow'

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

  // La duración solo se dice si todas las paradas la traen: una suma a medias engaña.
  const segundos = stops.reduce((n, s) => n + (Number(s.audio_duration_seconds) || 0), 0)
  const conDuracion = allReady && stops.every((s) => Number(s.audio_duration_seconds) > 0)
  const paradas = `${stops.length} ${stops.length === 1 ? 'parada' : 'paradas'}`

  return (
    <TrackRow
      featured={allReady}
      ready={allReady}
      icon={Headphones}
      tone="primary"
      to={scopeRoute(tripId, scope)}
      eyebrow="Audioguía"
      title={allReady ? 'Escuchar la visita' : generating ? 'Creando los audios…' : 'Aún no tiene audioguía'}
      meta={
        allReady
          ? conDuracion ? `${paradas} · ${Math.max(1, Math.round(segundos / 60))} min` : `${paradas} listas para escuchar`
          : generating ? 'Suele tardar uno o dos minutos.'
            : 'Crea una audioguía para visitar este sitio'
      }
      trailing={
        generating ? <Spinner className="size-4" label="Creando" />
          : allReady ? undefined
            : <span className="font-medium text-accent-foreground">Crear</span>
      }
      className={allReady ? undefined : 'border border-dashed border-border-strong px-3.5'}
    />
  )
}
