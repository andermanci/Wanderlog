import { useParams, Link } from 'react-router-dom'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Printer, MapPin, Calendar, Camera, Receipt, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/lib/queries/trips'
import { useItineraryDays, useActivities } from '@/lib/queries/itinerary'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useExpenses } from '@/lib/queries/expenses'
import { formatCurrency, formatDate, sumByCurrency, ACTIVITY_COLORS } from '@/lib/utils'

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', restaurant: '🍽️', activity: '🎯',
  transport: '🚌', place: '📍', other: '📌',
}

// "Recuerdo del viaje": compilación editorial del viaje — diario, fotos,
// actividades y gastos — pensada para releer y para imprimir/guardar en PDF.
export function TripMemoryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: photos } = useJournalPhotos(tripId!)
  const { data: expenses } = useExpenses(tripId!)

  if (isLoading || !trip) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-8 w-1/2" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  const actsByDay = new Map<string, NonNullable<typeof activities>>()
  for (const a of activities ?? []) {
    actsByDay.set(a.day_id, [...(actsByDay.get(a.day_id) ?? []), a].sort((x, y) => x.order_index - y.order_index))
  }
  const photosByDay = new Map<string, NonNullable<typeof photos>>()
  for (const p of photos ?? []) {
    photosByDay.set(p.day_id, [...(photosByDay.get(p.day_id) ?? []), p])
  }

  const nDays = differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1
  const totals = Object.entries(sumByCurrency(expenses ?? []))
  const daysWithContent = (days ?? []).filter(d =>
    d.journal || (photosByDay.get(d.id)?.length ?? 0) > 0 || (actsByDay.get(d.id)?.length ?? 0) > 0)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Barra superior (no se imprime) */}
      <div className="no-print flex items-center justify-between mb-6">
        <BackButton to={`/trips/${tripId}`}>Volver al viaje</BackButton>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer size={14} /> Imprimir / PDF
        </Button>
      </div>

      {/* Portada */}
      <header className="text-center mb-10">
        {trip.cover_image_url && (
          <img
            src={trip.cover_image_url}
            alt={trip.name}
            className="w-full h-64 object-cover rounded-2xl mb-8 border border-border"
          />
        )}
        <p className="text-xs uppercase tracking-[0.35em] mb-3" style={{ color: 'var(--primary)' }}>
          Recuerdo de viaje
        </p>
        <h1 className="font-serif text-5xl font-semibold leading-tight">{trip.name}</h1>
        <p className="text-muted-foreground mt-3 flex items-center justify-center gap-2 text-sm">
          <MapPin size={14} style={{ color: 'var(--primary)' }} /> {trip.destination}
          <span className="opacity-40">·</span>
          {formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}
        </p>
        <div className="w-14 h-0.5 mx-auto mt-6 rounded-full" style={{ background: 'var(--primary)' }} />
      </header>

      {/* Cifras del viaje */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
        {[
          { icon: Calendar, value: nDays, label: 'días' },
          { icon: Heart, value: activities?.length ?? 0, label: 'actividades' },
          { icon: Camera, value: photos?.length ?? 0, label: 'fotos' },
          { icon: Receipt, value: totals.length ? formatCurrency(totals[0][1], totals[0][0]) : '—', label: 'gastado' },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-xl p-4 text-center surface">
            <Icon size={15} className="mx-auto mb-1.5" style={{ color: 'var(--primary)' }} />
            <p className="font-serif text-xl font-medium">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Día a día */}
      <div className="space-y-12">
        {daysWithContent.map((day, idx) => {
          const dayActs = actsByDay.get(day.id) ?? []
          const dayPhotos = photosByDay.get(day.id) ?? []
          return (
            <section key={day.id} style={{ breakInside: 'avoid' }}>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="font-serif text-3xl font-semibold" style={{ color: 'var(--primary)' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <h2 className="font-serif text-xl font-medium capitalize">
                  {format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })}
                </h2>
              </div>

              {day.journal && (
                <p className="font-serif text-lg leading-relaxed whitespace-pre-line mb-4 pl-4 border-l-2"
                  style={{ borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)' }}>
                  {day.journal}
                </p>
              )}

              {dayPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {dayPhotos.map(p => (
                    <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer">
                      <img src={p.file_url} alt="" className="w-full aspect-square object-cover rounded-lg border border-border" />
                    </a>
                  ))}
                </div>
              )}

              {dayActs.length > 0 && (
                <ul className="space-y-1">
                  {dayActs.map(a => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span>{TYPE_ICONS[a.type]}</span>
                      {a.start_time && (
                        <span className="text-xs text-muted-foreground tabular-nums">{a.start_time.slice(0, 5)}</span>
                      )}
                      <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="hover:underline">
                        {a.title}
                      </Link>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ACTIVITY_COLORS[a.type] }} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/* Gastos */}
      {totals.length > 0 && (
        <div className="mt-12 rounded-xl p-5 surface">
          <h2 className="font-serif text-lg mb-2">Lo que costó la aventura</h2>
          <p className="text-sm text-muted-foreground">
            {totals.map(([c, v]) => formatCurrency(v, c)).join(' · ')} en {(expenses ?? []).length} gastos
          </p>
        </div>
      )}

      {/* Cierre */}
      <footer className="text-center mt-16 mb-8">
        <p className="font-serif italic text-2xl" style={{ color: 'var(--primary)' }}>
          Fin del viaje ✦
        </p>
        <p className="text-xs text-muted-foreground mt-2">Hecho con Wanderlog</p>
      </footer>
    </div>
  )
}
