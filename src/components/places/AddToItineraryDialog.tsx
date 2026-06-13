import { useState } from 'react'
import { parseISO } from 'date-fns'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { useCreateActivity, useItineraryDays } from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { toast } from 'sonner'

export interface PendingPlace {
  name: string
  address: string | null
  link: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
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
  const createActivity = useCreateActivity()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  async function add() {
    if (!place || !date) return
    const dayId = days?.find(d => d.date === date)?.id
    if (!dayId) { toast.error('Esa fecha no está dentro del viaje'); return }
    await createActivity.mutateAsync({
      trip_id: tripId,
      day_id: dayId,
      end_day_id: null,
      type: 'place',
      title: place.name,
      address: place.address ?? null,
      start_time: time || null,
      end_time: null,
      description: null,
      price: null,
      external_link: place.link ?? null,
      notes: null,
      order_index: 0,
      place_id: place.place_id,
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
      <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="font-serif">Añadir al itinerario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">{place?.name}</p>
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
            style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
            <Calendar size={14} className="mr-2" />
            Añadir al itinerario
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
