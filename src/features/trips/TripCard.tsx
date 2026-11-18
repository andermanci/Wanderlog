import { Link } from 'react-router-dom'
import { ArrowRight, Copy, Pencil, Trash2, Users } from 'lucide-react'
import { Badge, Menu, type Tone } from '@/design'
import { cn, countdownLabel, daysUntil, effectiveStatus, formatDate, STATUS_LABELS } from '@/lib/utils'
import { fallbackCover } from '@/lib/coverFallbacks'
import { useAuthStore } from '@/store/authStore'
import type { Trip } from '@/types/database'
import { dateRange } from './copy'

interface TripCardProps {
  trip: Trip
  onEdit: (trip: Trip) => void
  onDelete: (trip: Trip) => void
  onDuplicate: (trip: Trip) => void
  /** Cuenta suspendida: no se ofrecen acciones de escritura. */
  readOnly?: boolean
  /** Tarjeta panorámica (el viaje en curso). */
  featured?: boolean
}

/**
 * Un viaje como un póster: la foto a sangre y todo lo demás encima.
 * Las acciones van en un menú «⋯» siempre visible.
 */
export function TripCard({ trip, onEdit, onDelete, onDuplicate, readOnly, featured }: TripCardProps) {
  const { user } = useAuthStore()
  const status = effectiveStatus(trip)
  const shared = !!user && trip.user_id !== user.id
  const upcoming = daysUntil(trip.start_date) >= 0 && status !== 'completed'
  const past = status === 'completed'

  return (
    <article className="group relative h-full">
      <Link
        to={`/trips/${trip.id}`}
        className={cn(
          'relative block overflow-hidden rounded-3xl bg-secondary shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-float',
          featured ? 'aspect-[4/5] sm:aspect-[3/1]' : 'aspect-[4/5]',
        )}
      >
        <img
          src={trip.cover_image_url || fallbackCover(trip.id)}
          alt="" loading="lazy"
          className={cn('absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105', past && 'saturate-[0.6]')}
        />
        <div className="photo-scrim absolute inset-0" />

        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-1.5 pr-14">
          <Badge tone={status as Tone} solid>{STATUS_LABELS[status]}</Badge>
          {shared && (
            <span className="on-photo inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold">
              <Users className="size-3.5" aria-hidden="true" /> Compartido
            </span>
          )}
        </div>

        <div className={cn('absolute text-white', featured ? 'inset-x-5 bottom-5 sm:inset-x-8 sm:bottom-7' : 'inset-x-3.5 bottom-3.5 sm:inset-x-5 sm:bottom-5')}>
          {upcoming && (
            <p className="mb-2 inline-flex h-7 items-center rounded-full bg-white px-3 text-xs font-bold text-black">{countdownLabel(trip.start_date)}</p>
          )}
          <h3 className={cn('font-serif font-medium leading-[1.05] tracking-tight line-clamp-3', featured ? 'text-4xl sm:text-5xl' : 'text-xl sm:text-3xl')}>
            {trip.name}
          </h3>
          <p className="mt-1.5 truncate text-sm font-medium text-white/90">{trip.destination}</p>
          <p className="mt-0.5 flex items-center justify-between gap-3 text-sm text-white/75">
            <span className="truncate tabular-nums">{dateRange(trip.start_date, trip.end_date, formatDate)}</span>
            {featured && (
              <span className="on-photo hidden h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold sm:inline-flex">
                Abrir viaje <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            )}
          </p>
          {trip.tags.length > 0 && (
            <p className={cn('mt-2.5 flex-wrap gap-1.5', featured ? 'flex' : 'hidden sm:flex')}>
              {trip.tags.slice(0, 3).map(tag => (
                <span key={tag} className="on-photo rounded-full px-2.5 py-0.5 text-xs font-medium">{tag}</span>
              ))}
              {trip.tags.length > 3 && <span className="self-center text-xs text-white/75">+{trip.tags.length - 3}</span>}
            </p>
          )}
        </div>
      </Link>

      {/* Con la cuenta suspendida no se enseñan (en vez de deshabilitarlas): RLS
          filtra la escritura en silencio y un botón visible parecería funcionar. */}
      {!readOnly && (
        <div className="absolute right-3 top-3">
          <Menu
            label={`Opciones de ${trip.name}`}
            triggerVariant="photo"
            items={[
              { label: 'Editar', icon: Pencil, onSelect: () => onEdit(trip) },
              // Duplicar y eliminar son cosas de quien creó el viaje, no de quien va invitado.
              !shared && { label: 'Duplicar', icon: Copy, onSelect: () => onDuplicate(trip), hint: 'Copia el plan y la guía' },
              !shared && { label: 'Eliminar', icon: Trash2, onSelect: () => onDelete(trip), danger: true, separated: true },
            ]}
          />
        </div>
      )}
    </article>
  )
}
