import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ActivityIcon } from '@/design'
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

/** Un día del recuerdo: número grande, fecha, lo escrito en el diario, las fotos y lo que se hizo. */
export function MemoryDay({ tripId, number, day, activities, photos, onOpenPhoto }: MemoryDayProps) {
  const date = format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })

  return (
    <article className="break-inside-avoid">
      <header className="flex items-baseline gap-4 border-b border-border pb-3">
        <span aria-hidden="true" className="title-hero text-primary tabular-nums">{String(number).padStart(2, '0')}</span>
        <div className="min-w-0">
          <p className="eyebrow">Día {number}</p>
          <h3 className="title-section first-letter:uppercase">{date}</h3>
        </div>
      </header>

      {day.journal && (
        <p className="mt-5 whitespace-pre-line border-l-2 border-tone-line pl-4 font-serif text-lg leading-relaxed">
          {day.journal}
        </p>
      )}

      {photos.length > 0 && (
        <ul className={photos.length === 1 ? 'mt-5' : 'mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3'}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPhoto(p)}
                aria-label={`Ver en grande la foto ${i + 1} del ${date}`}
                className="block w-full overflow-hidden rounded-xl border border-border transition-[filter] duration-150 hover:brightness-95"
              >
                <img
                  src={p.file_url}
                  alt=""
                  loading="lazy"
                  className={photos.length === 1 ? 'max-h-112 w-full object-cover' : 'aspect-square w-full object-cover'}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {activities.length > 0 && (
        <ul className="mt-5 space-y-1">
          {activities.map(a => (
            <li key={a.id} data-tone={a.type}>
              <Link
                to={`/trips/${tripId}/itinerary/${a.id}`}
                className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-[0.9375rem] transition-colors duration-150 hover:bg-secondary/70 print:min-h-0 print:py-1"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                  <ActivityIcon type={a.type} className="size-4" />
                </span>
                <span className="w-11 shrink-0 text-sm text-muted-foreground tabular-nums">
                  {a.start_time ? a.start_time.slice(0, 5) : ''}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
