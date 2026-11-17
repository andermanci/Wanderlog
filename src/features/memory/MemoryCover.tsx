import { MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Trip } from '@/types/database'

/** Portada del recuerdo: la foto del viaje a sangre con el título encima, como una revista. */
export function MemoryCover({ trip }: { trip: Trip }) {
  const dates = `${formatDate(trip.start_date, "d 'de' MMMM")} — ${formatDate(trip.end_date, "d 'de' MMMM 'de' yyyy")}`

  if (!trip.cover_image_url) {
    return (
      <header className="rounded-3xl bg-primary-soft px-6 py-14 text-center md:py-20 print:py-10">
        <p className="eyebrow text-accent-foreground">Recuerdo del viaje</p>
        <h2 className="title-hero mt-3">{trip.name}</h2>
        <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-2 text-[0.9375rem] text-muted-foreground">
          <MapPin className="size-4" aria-hidden="true" /> {trip.destination} · {dates}
        </p>
      </header>
    )
  }

  return (
    <header className="relative overflow-hidden rounded-3xl shadow-raised print:shadow-none">
      <img src={trip.cover_image_url} alt="" className="h-80 w-full object-cover md:h-112 print:h-72" />
      <div aria-hidden="true" className="absolute inset-0 photo-scrim" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-10">
        <p className="text-2xs font-semibold uppercase tracking-widest opacity-90">Recuerdo del viaje</p>
        <h2 className="title-hero mt-2">{trip.name}</h2>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[0.9375rem] opacity-90">
          <MapPin className="size-4" aria-hidden="true" /> {trip.destination} · {dates}
        </p>
      </div>
    </header>
  )
}
