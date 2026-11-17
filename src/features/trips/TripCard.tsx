import { Link } from 'react-router-dom'
import { CalendarDays, Copy, Pencil, Trash2, Users } from 'lucide-react'
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
  /** Tarjeta grande (el viaje en curso). */
  featured?: boolean
}

/** Un viaje en la lista: la foto manda, el nombre va encima y las acciones en un menú «⋯» siempre visible. */
export function TripCard({ trip, onEdit, onDelete, onDuplicate, readOnly, featured }: TripCardProps) {
  const { user } = useAuthStore()
  const status = effectiveStatus(trip)
  const shared = !!user && trip.user_id !== user.id
  const upcoming = daysUntil(trip.start_date) >= 0 && status !== 'completed'

  return (
    <article className="group relative h-full">
      <Link
        to={`/trips/${trip.id}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised"
      >
        <div className={cn('relative overflow-hidden', featured ? 'h-64 md:h-80' : 'h-52')}>
          <img
            src={trip.cover_image_url || fallbackCover(trip.id)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="photo-scrim absolute inset-0" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <Badge tone={status as Tone} solid>{STATUS_LABELS[status]}</Badge>
            {shared && (
              <span className="on-photo inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold">
                <Users className="size-3.5" aria-hidden="true" /> Compartido
              </span>
            )}
          </div>
          <div className="absolute inset-x-4 bottom-3.5 text-white">
            <h3 className={cn('font-serif font-medium leading-tight tracking-tight line-clamp-2', featured ? 'text-3xl md:text-4xl' : 'text-2xl')}>
              {trip.name}
            </h3>
            <p className="mt-0.5 truncate text-sm text-white/85">{trip.destination}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {dateRange(trip.start_date, trip.end_date, formatDate)}
          </span>
          {upcoming && <Badge tone="primary" className="ml-auto">{countdownLabel(trip.start_date)}</Badge>}
          {trip.tags.length > 0 && (
            <span className="flex w-full flex-wrap gap-1.5">
              {trip.tags.slice(0, 3).map(tag => (
                <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{tag}</span>
              ))}
              {trip.tags.length > 3 && <span className="text-xs text-muted-foreground">+{trip.tags.length - 3}</span>}
            </span>
          )}
        </div>
      </Link>

      {/* Con la cuenta suspendida no se enseñan (en vez de deshabilitarlas): RLS
          filtra la escritura en silencio y un botón visible parecería funcionar. */}
      {!readOnly && (
        <div className="absolute right-2.5 top-2.5">
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
