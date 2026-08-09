import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Calendar, Tag, Trash2, Pencil, Users, Copy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, countdownLabel, STATUS_LABELS, STATUS_COLORS, daysUntil, effectiveStatus } from '@/lib/utils'
import { fallbackCover } from '@/lib/coverFallbacks'
import { useAuthStore } from '@/store/authStore'
import type { Trip } from '@/types/database'

interface TripCardProps {
  trip: Trip
  onEdit: (trip: Trip) => void
  onDelete: (trip: Trip) => void
  onDuplicate: (trip: Trip) => void
  index?: number
}

export function TripCard({ trip, onEdit, onDelete, onDuplicate, index = 0 }: TripCardProps) {
  const { user } = useAuthStore()
  const imageUrl = trip.cover_image_url || fallbackCover(trip.id)
  const days = daysUntil(trip.start_date)
  const status = effectiveStatus(trip)
  const isUpcoming = days >= 0 && status !== 'completed'
  const statusColor = STATUS_COLORS[status]
  const isShared = !!user && trip.user_id !== user.id

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      className="group relative rounded-xl overflow-hidden cursor-pointer h-full flex flex-col"
      style={{ border: '1px solid color-mix(in srgb, var(--primary) 10%, transparent)', background: 'var(--card)' }}
    >
      <Link to={`/trips/${trip.id}`} className="flex flex-col flex-1">
        {/* Imagen de fondo */}
        <div className="relative h-52 overflow-hidden flex-shrink-0">
          <img
            src={imageUrl}
            alt={trip.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="card-overlay absolute inset-0" />

          {/* Status badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgb(20,14,10)', color: statusColor, border: `1px solid ${statusColor}` }}
            >
              {STATUS_LABELS[status]}
            </span>
            {isShared && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 text-white"
                style={{ background: 'rgb(20,14,10)', border: '1px solid rgba(255,255,255,0.28)' }}
              >
                <Users size={11} /> Compartido
              </span>
            )}
          </div>

          {/* Countdown */}
          {isUpcoming && (
            <div
              className="absolute bottom-3 left-3 rounded-lg px-2.5 py-1"
              style={{ background: 'rgb(20,14,10)', border: '1px solid rgba(255,255,255,0.28)' }}
            >
              <span className="text-xs font-medium text-white">
                {countdownLabel(trip.start_date)}
              </span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="p-4 flex-1" style={{ background: 'var(--card)' }}>
          <h3 className="font-serif text-xl font-medium text-foreground mb-1 line-clamp-1">{trip.name}</h3>

          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-3">
            <MapPin size={13} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
            <span className="truncate">{trip.destination}</span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-3">
            <Calendar size={12} className="flex-shrink-0" />
            <span>
              {formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}
            </span>
          </div>

          {trip.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag size={11} className="text-muted-foreground flex-shrink-0" />
              {trip.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs py-0 px-1.5 h-5"
                  style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)' }}>
                  {tag}
                </Badge>
              ))}
              {trip.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{trip.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Acciones: siempre pulsables. En táctil no existe hover, así que nada
          de pointer-events-none — con eso los taps atravesaban al Link y era
          imposible editar/duplicar/borrar desde el móvil. */}
      <div className="absolute top-2 right-2 flex gap-1.5 sm:gap-1 opacity-100 sm:opacity-60 sm:hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="w-9 h-9 sm:w-7 sm:h-7 glass rounded-md"
          onClick={(e) => { e.preventDefault(); onEdit(trip) }}
          aria-label="Editar viaje" title="Editar viaje"
        >
          <Pencil size={12} />
        </Button>
        {/* Duplicar y eliminar, solo en los viajes propios: son cosas del
            creador, no de quien viaja invitado. */}
        {!isShared && (
          <Button
            size="icon"
            variant="ghost"
            className="w-9 h-9 sm:w-7 sm:h-7 glass rounded-md"
            onClick={(e) => { e.preventDefault(); onDuplicate(trip) }}
            aria-label="Duplicar viaje" title="Duplicar viaje"
          >
            <Copy size={12} />
          </Button>
        )}
        {!isShared && (
          <Button
            size="icon"
            variant="ghost"
            className="w-9 h-9 sm:w-7 sm:h-7 glass rounded-md text-destructive hover:text-destructive"
            onClick={(e) => { e.preventDefault(); onDelete(trip) }}
            aria-label="Eliminar viaje" title="Eliminar viaje"
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </motion.div>
  )
}
