import { Link } from 'react-router-dom'
import { ChevronRight, MapPin, Calendar } from 'lucide-react'
import { useTrip } from '@/lib/queries/trips'
import { formatDate, countdownLabel } from '@/lib/utils'

const FALLBACK = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=200&q=60'

interface TripHeaderProps {
  tripId: string
  section: string
}

// Cabecera persistente dentro de un viaje: breadcrumb + contexto (portada,
// nombre, destino, fechas, cuenta atrás). Da orientación en todas las secciones.
export function TripHeader({ tripId, section }: TripHeaderProps) {
  const { data: trip } = useTrip(tripId)

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 flex-wrap">
        <Link to="/dashboard" className="hover:text-foreground transition-colors">Viajes</Link>
        <ChevronRight size={12} className="opacity-50" />
        <Link to={`/trips/${tripId}`} className="hover:text-foreground transition-colors truncate max-w-[180px]">
          {trip?.name ?? '…'}
        </Link>
        <ChevronRight size={12} className="opacity-50" />
        <span className="text-foreground font-medium">{section}</span>
      </nav>

      {/* Contexto del viaje */}
      {trip && (
        <div className="flex items-center gap-3">
          <Link to={`/trips/${tripId}`} className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 border border-border">
            <img src={trip.cover_image_url || FALLBACK} alt={trip.name} className="w-full h-full object-cover" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/trips/${tripId}`} className="font-serif text-lg font-medium hover:text-primary transition-colors line-clamp-1">
              {trip.name}
            </Link>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <MapPin size={11} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
              {trip.destination}
              <span className="opacity-40">·</span>
              <Calendar size={11} className="flex-shrink-0" />
              {formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}
            </p>
          </div>
          <span
            className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
          >
            {countdownLabel(trip.start_date)}
          </span>
        </div>
      )}
    </div>
  )
}
