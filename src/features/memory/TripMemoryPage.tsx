import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { differenceInDays, parseISO } from 'date-fns'
import { BookOpen, CalendarDays, Camera, Printer, Receipt, Sparkles, type LucideIcon } from 'lucide-react'
import { Button, Empty, Modal, Page, Skeleton } from '@/design'
import { useExpenses } from '@/lib/queries/expenses'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useTrip } from '@/lib/queries/trips'
import { formatCurrency, sumByCurrency } from '@/lib/utils'
import type { Activity, JournalPhoto } from '@/types/database'
import { MemoryCover } from './MemoryCover'
import { MemoryDay } from './MemoryDay'
import { MemoryExpenses } from './MemoryExpenses'

/**
 * «Recuerdo del viaje»: el viaje contado como una revista —portada, cifras, día
 * a día con el diario y las fotos, y las cuentas—, para releer y para imprimir
 * o guardar en PDF.
 */
export function TripMemoryPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId)
  const { data: days } = useItineraryDays(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: photos } = useJournalPhotos(tripId)
  const { data: expenses } = useExpenses(tripId)
  const [photo, setPhoto] = useState<JournalPhoto | null>(null)

  const back = { to: `/trips/${tripId}`, label: 'Inicio del viaje' }
  // La cabecera de la página (volver, título, botón) no sale en el papel.
  const pageClass = 'print:[&>header]:hidden print:pt-0'

  if (isLoading || !trip) {
    return (
      <Page title="Recuerdo del viaje" back={back} width="narrow" className={pageClass}>
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </Page>
    )
  }

  const actsByDay = new Map<string, Activity[]>()
  for (const a of activities ?? []) actsByDay.set(a.day_id, [...(actsByDay.get(a.day_id) ?? []), a])
  for (const list of actsByDay.values()) list.sort((x, y) => x.order_index - y.order_index)
  const photosByDay = new Map<string, JournalPhoto[]>()
  for (const p of photos ?? []) photosByDay.set(p.day_id, [...(photosByDay.get(p.day_id) ?? []), p])

  const nDays = differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1
  const totals = Object.entries(sumByCurrency(expenses ?? []))
  const chapters = (days ?? []).filter(d =>
    d.journal || (photosByDay.get(d.id)?.length ?? 0) > 0 || (actsByDay.get(d.id)?.length ?? 0) > 0)

  const stats: { icon: LucideIcon; value: string; label: string }[] = [
    { icon: CalendarDays, value: String(nDays), label: nDays === 1 ? 'día' : 'días' },
    { icon: Sparkles, value: String(activities?.length ?? 0), label: 'actividades' },
    { icon: Camera, value: String(photos?.length ?? 0), label: 'fotos' },
    { icon: Receipt, value: totals.length ? formatCurrency(totals[0][1], totals[0][0]) : '—', label: 'gastado' },
  ]

  return (
    <Page
      title="Recuerdo del viaje"
      subtitle="Tu viaje contado de principio a fin, para releer o guardar."
      back={back}
      width="narrow"
      className={pageClass}
      actions={(
        <Button variant="primary" className="no-print" onClick={() => window.print()}>
          <Printer aria-hidden="true" /> Imprimir / PDF
        </Button>
      )}
    >
      <div className="space-y-12 print:space-y-8">
        <MemoryCover trip={trip} />

        {/* El viaje en cuatro cifras, como la entradilla de un reportaje. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-y-2 border-foreground/80 py-6 print:grid-cols-4 print:py-4">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex min-w-0 flex-col-reverse">
              <dt className="eyebrow mt-1.5 flex items-center gap-1.5">
                <Icon className="size-3.5" aria-hidden="true" /> {label}
              </dt>
              <dd className="truncate font-serif text-3xl font-medium leading-none tracking-tight tabular-nums sm:text-5xl print:text-2xl">{value}</dd>
            </div>
          ))}
        </dl>

        {chapters.length === 0 ? (
          <Empty
            className="no-print"
            icon={BookOpen}
            title="Este recuerdo aún está en blanco"
            description="Se llena solo con lo que haya en el plan: las actividades de cada día, lo que escribas en el diario y las fotos que subas."
          >
            <Button asChild variant="soft"><Link to={`/trips/${tripId}/itinerary`}>Ir al plan</Link></Button>
          </Empty>
        ) : (
          <div className="space-y-16 print:space-y-10">
            {chapters.map((day, i) => (
              <MemoryDay
                key={day.id}
                tripId={tripId}
                number={i + 1}
                day={day}
                activities={actsByDay.get(day.id) ?? []}
                photos={photosByDay.get(day.id) ?? []}
                onOpenPhoto={setPhoto}
              />
            ))}
          </div>
        )}

        <MemoryExpenses expenses={expenses ?? []} />

        <footer className="break-inside-avoid pb-4 text-center">
          <span aria-hidden="true" className="mx-auto mb-5 block h-px w-16 bg-border-strong" />
          <p className="title-page italic text-primary">Fin del viaje</p>
          <p className="mt-2 text-xs text-muted-foreground">Hecho con Wanderlog</p>
        </footer>
      </div>

      <Modal
        open={!!photo}
        onOpenChange={open => { if (!open) setPhoto(null) }}
        title="Foto del viaje"
        hideTitle
        size="lg"
        className="overflow-hidden"
      >
        {photo && <img src={photo.file_url} alt="" className="max-h-[calc(100dvh-2rem)] w-full object-contain" />}
      </Modal>
    </Page>
  )
}
