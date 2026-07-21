import { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { Calendar, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { useCreateActivity, useItineraryDays } from '@/lib/queries/itinerary'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useTrip } from '@/lib/queries/trips'
import { placeCategoryToActivityType } from '@/lib/maps'
import { dayCities, resolveNames } from '@/lib/cities'
import { formatDate } from '@/lib/utils'
import type { ItineraryDay, PlaceCategory } from '@/types/database'
import { toast } from 'sonner'

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

// Diálogo reutilizable: pasa un lugar guardado (o de búsqueda) a un día del
// itinerario. Usado por el mapa y por la sección de Lugares.
export function AddToItineraryDialog({ open, onOpenChange, tripId, place }: Props) {
  const { data: trip } = useTrip(tripId)
  const { data: days } = useItineraryDays(tripId)
  const { data: guides } = useDestinationGuides(tripId)
  const createActivity = useCreateActivity()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  // Pista: ¿en qué ciudad está el sitio y qué días del viaje pasan por ella?
  // Se cruzan las ciudades de cada día (itinerary_days.cities) con lo que
  // aparece en el nombre/dirección del lugar. Es orientativo, no bloquea nada.
  const hint = useMemo(() => {
    if (!place || !days?.length) return null
    const namesOf = (d: ItineraryDay) => resolveNames(dayCities(d), guides).map(c => c.name)
    const haystack = `${place.name} ${place.address ?? ''}`.toLowerCase()

    const cities = Array.from(new Set(days.flatMap(namesOf)))
    let city = cities.find(c => haystack.includes(c.toLowerCase())) ?? null
    let matchedDays = city
      ? days.filter(d => namesOf(d).some(n => n.toLowerCase() === city!.toLowerCase()))
      : []

    // Sin ciudad por día: probar con el destino del viaje (ej. "Roma, Italia").
    if (!city && trip?.destination) {
      const destCity = trip.destination.split(',')[0].trim()
      if (destCity && haystack.includes(destCity.toLowerCase())) { city = destCity; matchedDays = days }
    }
    if (!city || matchedDays.length === 0) return null
    return { city, days: matchedDays }
  }, [place, days, guides, trip])

  async function add() {
    if (!place || !date) return
    const dayId = days?.find(d => d.date === date)?.id
    if (!dayId) { toast.error('Esa fecha no está dentro del viaje'); return }
    await createActivity.mutateAsync({
      trip_id: tripId,
      day_id: dayId,
      end_day_id: null,
      // Restaurante/hotel/etc. según la categoría del sitio (antes: siempre 'place').
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
      // Google Place ID. El id de Google es texto y provocaba 22P02; la
      // actividad ya guarda título, dirección y coords, así que va a null.
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
    setDate(''); setTime('')
    onOpenChange(false)
    toast.success('Añadido al itinerario')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDate(''); setTime('') } onOpenChange(o) }}>
      <DialogContent className="surface">
        <DialogHeader>
          <DialogTitle className="font-serif">Añadir al itinerario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">{place?.name}</p>

          {hint && (
            <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'var(--secondary)' }}>
              <p className="flex items-start gap-1.5">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  Parece estar en <strong>{hint.city}</strong>. En tu viaje estás allí del{' '}
                  {formatDate(hint.days[0].date, 'd MMM')} al {formatDate(hint.days[hint.days.length - 1].date, 'd MMM')}.
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {hint.days.map(d => {
                  const active = date === d.date
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDate(d.date)}
                      className="text-xs px-2 py-1 rounded-full border transition-colors capitalize"
                      style={{
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                        background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                      }}
                    >
                      {formatDate(d.date, 'EEE d')}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Día</Label>
            <DatePicker
              value={date}
              onChange={setDate}
              placeholder="Elige un día del viaje"
              fromDate={trip ? parseISO(trip.start_date) : undefined}
              toDate={trip ? parseISO(trip.end_date) : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hora (opcional)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!date || createActivity.isPending} onClick={add}
            variant="brand">
            <Calendar size={14} className="mr-2" />
            Añadir al itinerario
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
