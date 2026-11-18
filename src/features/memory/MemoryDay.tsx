import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ActivityIcon } from '@/design'
import { cn } from '@/lib/utils'
import type { Activity, ItineraryDay, JournalPhoto } from '@/types/database'

interface MemoryDayProps {
  tripId: string
  /** Número de capítulo (1, 2, 3…) entre los días con contenido. */
  number: number
  day: ItineraryDay
  activities: Activity[]
  photos: JournalPhoto[]
  onOpenPhoto: (photo: JournalPhoto) => void
}

/**
 * Un día del recuerdo, como un capítulo de revista: número enorme, fecha, lo
 * escrito en el diario con letra de lectura, las fotos en mosaico y lo que se hizo.
 */
export function MemoryDay({ tripId, number, day, activities, photos, onOpenPhoto }: MemoryDayProps) {
  const date = format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })
  // Con tres fotos o más, la primera manda: ocupa dos columnas y dos filas.
  const mosaic = photos.length >= 3

  return (
    <article>
      <header className="flex items-end gap-4 border-b-2 border-foreground/80 pb-3 break-inside-avoid break-after-avoid">
        <span aria-hidden="true" className="font-serif text-7xl font-medium leading-[0.8] tracking-tighter text-primary tabular-nums md:text-8xl print:text-6xl">
          {String(number).padStart(2, '0')}
        </span>
        <div className="min-w-0 pb-0.5">
          <p className="eyebrow">Día {number}</p>
          <h3 className="title-page first-letter:uppercase">{date}</h3>
        </div>
      </header>

      {day.journal && (
        <p className="mt-6 max-w-prose whitespace-pre-line font-serif text-lg leading-relaxed first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-6xl first-letter:font-medium first-letter:leading-[0.85] first-letter:text-primary print:text-base">
          {day.journal}
        </p>
      )}

      {photos.length > 0 && (
        <ul className={cn(
          'mt-6 grid gap-1.5',
          photos.length === 1 ? 'grid-cols-1' : mosaic ? 'grid-cols-3' : 'grid-cols-2',
        )}>
          {photos.map((p, i) => (
            <li key={p.id} className={cn('break-inside-avoid', mosaic && i === 0 && 'col-span-2 row-span-2')}>
              <button
                type="button"
                onClick={() => onOpenPhoto(p)}
                aria-label={`Ver en grande la foto ${i + 1} del ${date}`}
                className="block size-full overflow-hidden rounded-lg transition-[filter] duration-150 hover:brightness-95"
              >
                <img
                  src={p.file_url}
                  alt=""
                  loading="lazy"
                  className={photos.length === 1 ? 'max-h-112 w-full object-cover' : 'aspect-square size-full object-cover'}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {activities.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow">Lo que hicimos</p>
          <ul className="mt-1.5">
            {activities.map(a => (
              <li key={a.id} data-tone={a.type} className="border-b border-border last:border-b-0">
                <Link
                  to={`/trips/${tripId}/itinerary/${a.id}`}
                  className="flex min-h-11 items-center gap-3 py-1.5 text-[0.9375rem] transition-colors duration-150 hover:text-accent-foreground print:min-h-0 print:py-1"
                >
                  <span className="w-11 shrink-0 text-sm font-semibold tabular-nums">
                    {a.start_time ? a.start_time.slice(0, 5) : <span className="text-muted-foreground" aria-hidden="true">·</span>}
                  </span>
                  <ActivityIcon type={a.type} className="size-4 shrink-0 text-tone" />
                  <span className="min-w-0 flex-1 font-serif text-base leading-snug">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
