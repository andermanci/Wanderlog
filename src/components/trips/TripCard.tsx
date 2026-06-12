import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Calendar, Tag, Trash2, Pencil, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatDate, countdownLabel, STATUS_LABELS, STATUS_COLORS, daysUntil, effectiveStatus } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { Trip } from '@/types/database'

interface TripCardProps {
  trip: Trip
  onEdit: (trip: Trip) => void
  onDelete: (trip: Trip) => void
  index?: number
}

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80',
]

export function TripCard({ trip, onEdit, onDelete, index = 0 }: TripCardProps) {
  const { user } = useAuthStore()
  const imageUrl = trip.cover_image_url || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]
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
      className="group relative rounded-xl overflow-hidden cursor-pointer"
      style={{ border: '1px solid color-mix(in srgb, var(--primary) 10%, transparent)' }}
    >
      <Link to={`/trips/${trip.id}`} className="block">
        {/* Imagen de fondo */}
        <div className="relative h-52 overflow-hidden">
          <img
            src={imageUrl}
            alt={trip.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="card-overlay absolute inset-0" />

          {/* Status badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
            >
              {STATUS_LABELS[status]}
            </span>
            {isShared && (
              <span className="glass text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 text-white/90">
                <Users size={11} /> Compartido
              </span>
            )}
          </div>

          {/* Countdown */}
          {isUpcoming && (
            <div className="absolute top-3 right-3 glass rounded-lg px-2.5 py-1">
              <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                {countdownLabel(trip.start_date)}
              </span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="p-4" style={{ background: 'var(--card)' }}>
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

      {/* Acciones (aparecen en hover) */}
      <div className={cn(
        'absolute top-2 right-2 flex gap-1 opacity-60 hover:opacity-100 transition-opacity',
        'pointer-events-none group-hover:pointer-events-auto',
      )}>
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 glass rounded-md"
          onClick={(e) => { e.preventDefault(); onEdit(trip) }}
        >
          <Pencil size={12} />
        </Button>
        {!isShared && (
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 glass rounded-md text-destructive hover:text-destructive"
            onClick={(e) => { e.preventDefault(); onDelete(trip) }}
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </motion.div>
  )
}
