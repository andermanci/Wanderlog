import { MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { fallbackCover } from '@/lib/coverFallbacks'
import type { Trip } from '@/types/database'

/** Portada del recuerdo: la foto del viaje a sangre con el título encima, como una revista. */
export function MemoryCover({ trip }: { trip: Trip }) {
  const dates = `${formatDate(trip.start_date, "d 'de' MMMM")} — ${formatDate(trip.end_date, "d 'de' MMMM 'de' yyyy")}`

  return (
    <header className="relative overflow-hidden rounded-3xl shadow-raised print:shadow-none">
      {/* Sin foto propia, la misma portada de reserva que el viaje usa en el resto de la app. */}
      <img src={trip.cover_image_url || fallbackCover(trip.id)} alt="" className="h-80 w-full object-cover md:h-112 print:h-72" />
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
