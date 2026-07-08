import { Link } from 'react-router-dom'
import { ChevronRight, Headphones, Loader2 } from 'lucide-react'
import { useAudioguide } from '@/lib/queries/audioguides'
import type { Activity } from '@/types/database'

interface Props {
  activity: Activity
  tripId: string
}

// Punto de entrada a la audioguía desde el detalle de la actividad: la
// generación, el pegado del guion y el reproductor viven en su propia
// página (AudioguidePage), a la que solo se llega desde aquí.
export function AudioguideEntryCard({ activity, tripId }: Props) {
  const { data: audioguide, isLoading } = useAudioguide(activity.id)
  if (isLoading) return null

  const stops = audioguide?.stops ?? []
  const allReady = stops.length > 0 && stops.every((s) => s.status === 'ready')
  const generating = !!audioguide && !allReady

  return (
    <Link
      to={`/trips/${tripId}/itinerary/${activity.id}/audioguide`}
      className="rounded-xl p-4 flex items-center justify-between gap-2 transition-colors hover:border-primary/50"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Headphones size={16} style={{ color: 'var(--primary)' }} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Audioguía</p>
          <p className="text-xs text-muted-foreground truncate">
            {!audioguide && 'Genera una audioguía con Claude para visitar este lugar'}
            {generating && 'Generando…'}
            {allReady && `${stops.length} paradas listas para escuchar`}
          </p>
        </div>
      </div>
      {generating ? (
        <Loader2 size={16} className="animate-spin text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
      )}
    </Link>
  )
}
