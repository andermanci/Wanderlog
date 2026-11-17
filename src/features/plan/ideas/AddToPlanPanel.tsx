import { useMemo, useState } from 'react'
import { CalendarPlus, Check, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Empty, Field, Input, Notice, Panel, Skeleton } from '@/design'
import { useActivities, useCreateActivity, useItineraryDays } from '@/lib/queries/itinerary'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useTrip } from '@/lib/queries/trips'
import { placeCategoryToActivityType } from '@/lib/maps'
import { citiesLabel, dayCities, resolveNames } from '@/lib/cities'
import { cn, formatDate } from '@/lib/utils'
import type { ItineraryDay, PlaceCategory } from '@/types/database'

/**
 * Un sitio listo para pasar al plan: vale igual para un lugar guardado que para
 * un resultado de búsqueda del mapa.
 */
export interface PendingPlace {
  name: string
  address: string | null
  link: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  category?: PlaceCategory | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  place: PendingPlace | null
}

/**
 * EL «Añadir al plan» de la app: se elige el día (y la hora si se sabe) y se
 * crea la actividad. Lo usan el mapa y la lista de ideas.
 */
export function AddToPlanPanel({ open, onOpenChange, tripId, place }: Props) {
  const { data: trip } = useTrip(tripId)
  const { data: days, isLoading } = useItineraryDays(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: guides } = useDestinationGuides(tripId)
  const createActivity = useCreateActivity()
  const [dayId, setDayId] = useState('')
  const [time, setTime] = useState('')

  // Cuántas actividades tiene ya cada día, para elegir con criterio.
  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    ;(activities ?? []).forEach(a => m.set(a.day_id, (m.get(a.day_id) ?? 0) + 1))
    return m
  }, [activities])

  // Pista: ¿en qué ciudad está el sitio y qué días del viaje pasan por ella?
  // Se cruzan las ciudades de cada día con lo que aparece en el nombre o la
  // dirección del lugar. Es orientativo, no bloquea nada.
  const hint = useMemo(() => {
    if (!place || !days?.length) return null
    const namesOf = (d: ItineraryDay) => resolveNames(dayCities(d), guides).map(c => c.name)
    const haystack = `${place.name} ${place.address ?? ''}`.toLowerCase()

    const cities = Array.from(new Set(days.flatMap(namesOf)))
    let city = cities.find(c => haystack.includes(c.toLowerCase())) ?? null
    let matched = city
      ? days.filter(d => namesOf(d).some(n => n.toLowerCase() === city!.toLowerCase()))
      : []

    // Sin ciudad por día: probar con el destino del viaje (p. ej. «Roma, Italia»).
    if (!city && trip?.destination) {
      const destCity = trip.destination.split(',')[0].trim()
      if (destCity && haystack.includes(destCity.toLowerCase())) { city = destCity; matched = days }
    }
    if (!city || matched.length === 0) return null
    return { city, days: matched, ids: new Set(matched.map(d => d.id)), whole: matched.length === days.length }
  }, [place, days, guides, trip])

  function close() {
    setDayId('')
    setTime('')
    onOpenChange(false)
  }

  async function add() {
    if (!place || !dayId) return
    const day = days?.find(d => d.id === dayId)
    if (!day) { toast.error('Ese día ya no está en el viaje. Elige otro.'); return }
    try {
      await createActivity.mutateAsync({
        trip_id: tripId,
        day_id: day.id,
        end_day_id: null,
        // Restaurante, hotel… según la categoría del sitio.
        type: place.category ? placeCategoryToActivityType(place.category) : 'place',
        title: place.name,
        address: place.address ?? null,
        start_time: time || null,
        end_time: null,
        description: null,
        price: null,
        external_link: place.link ?? null,
        notes: null,
        order_index: 0,
        // activities.place_id es un uuid (FK a la tabla interna 'places'), NO el
        // Google Place ID ni el id del lugar guardado: meterlo daba 22P02. La
        // actividad ya guarda título, dirección y coordenadas, así que va a null.
        place_id: null,
        cover_image_url: null,
        origin: null,
        destination: null,
        lat: place.lat,
        lng: place.lng,
        origin_lat: null,
        origin_lng: null,
        destination_lat: null,
        destination_lng: null,
      })
    } catch {
      return // el aviso de error ya lo da la mutación
    }
    // El aviso de «añadida» ya lo da la mutación.
    close()
  }

  return (
    <Panel
      open={open}
      onOpenChange={o => { if (o) onOpenChange(true); else close() }}
      title="Añadir al plan"
      description={place?.name}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" disabled={!dayId} loading={createActivity.isPending} onClick={add}>
            <CalendarPlus /> Añadir al plan
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {hint && (
          <Notice tone="info" icon={MapPin}>
            Parece estar en <strong>{hint.city}</strong>.{' '}
            {hint.whole
              ? 'Es el destino de tu viaje.'
              : hint.days.length === 1
                ? `Pasas por allí el ${formatDate(hint.days[0].date, "d 'de' MMM")}.`
                : `Pasas por allí del ${formatDate(hint.days[0].date, "d 'de' MMM")} al ${formatDate(hint.days[hint.days.length - 1].date, "d 'de' MMM")}.`}
          </Notice>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">¿Qué día?</h3>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-15 w-full rounded-xl" />)}
            </div>
          ) : !days?.length ? (
            <Empty bare icon={CalendarPlus} title="El viaje aún no tiene días" description="Abre la pestaña «Días» del plan para que se creen y vuelve a intentarlo." />
          ) : (
            <ul className="space-y-2">
              {days.map((d, i) => {
                const selected = d.id === dayId
                const n = countByDay.get(d.id) ?? 0
                const cities = citiesLabel({ cities: resolveNames(dayCities(d), guides) })
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setDayId(d.id)}
                      className={cn(
                        'flex min-h-15 w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left transition-colors duration-150',
                        selected ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-secondary',
                      )}
                    >
                      <span className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                      )}>
                        {selected ? <Check className="size-5" aria-hidden="true" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium first-letter:uppercase">
                          {formatDate(d.date, "EEEE d 'de' MMMM")}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {n === 0 ? 'Sin actividades' : n === 1 ? '1 actividad' : `${n} actividades`}
                          {cities ? ` · ${cities}` : ''}
                        </span>
                      </span>
                      {hint && !hint.whole && hint.ids.has(d.id) && <Badge tone="info">{hint.city}</Badge>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Field label="Hora" optional hint="Si aún no la sabes, déjala vacía: podrás ponerla después.">
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </Field>
      </div>
    </Panel>
  )
}
