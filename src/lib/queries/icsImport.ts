import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { docKeys } from '@/lib/queries/documents'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { activityTypeFor, type IcsBooking } from '@/lib/ics/parseIcs'
import type { ItineraryDay } from '@/types/database'
import { toast } from 'sonner'

// Crea, por cada reserva del .ics, el DOCUMENTO (con su localizador y su
// proveedor) y, si la fecha cae dentro del viaje, también la ACTIVIDAD del
// itinerario — enlazadas entre sí por documents.activity_id.
//
// Sin esto el usuario metía el vuelo dos veces y nada las unía.

/** Hora local (HH:MM) del instante ISO, o null en los eventos de día completo. */
function timeOf(iso: string, allDay: boolean): string | null {
  if (allDay) return null
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const dateOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)

export function useImportIcsBookings(tripId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (bookings: IcsBooking[]) => {
      const { data: days, error: daysError } = await supabase
        .from('itinerary_days')
        .select('id, date')
        .eq('trip_id', tripId)
      if (daysError) throw daysError

      const dayIdByDate = new Map((days as Pick<ItineraryDay, 'id' | 'date'>[]).map(d => [d.date, d.id]))
      let created = 0
      let outside = 0

      for (const b of bookings) {
        const startDate = dateOf(b.start)
        const dayId = dayIdByDate.get(startDate)
        let activityId: string | null = null

        // Solo se crea la actividad si el día existe en el itinerario. Una
        // reserva anterior al viaje (el vuelo de ida comprado con meses de
        // antelación cae dentro; un seguro anual, no) se guarda igualmente como
        // documento: no se pierde nada.
        if (dayId) {
          const endDayId = b.end ? dayIdByDate.get(dateOf(b.end)) ?? null : null
          const { data: activity, error } = await supabase
            .from('activities')
            .insert({
              trip_id: tripId,
              day_id: dayId,
              end_day_id: endDayId && endDayId !== dayId ? endDayId : null,
              type: activityTypeFor(b.category),
              title: b.title,
              address: b.location,
              origin: b.origin,
              destination: b.destination,
              start_time: timeOf(b.start, b.allDay),
              end_time: b.end ? timeOf(b.end, b.allDay) : null,
              notes: b.notes,
              order_index: 0,
            })
            .select('id')
            .single()
          if (error) throw error
          activityId = activity.id
        } else {
          outside++
        }

        const { error: docError } = await supabase.from('documents').insert({
          trip_id: tripId,
          activity_id: activityId,
          category: b.category,
          title: b.title,
          locator: b.locator,
          provider: b.provider,
          origin: b.origin,
          destination: b.destination,
          datetime_start: b.start,
          datetime_end: b.end,
          notes: b.notes,
        })
        if (docError) throw docError
        created++
      }

      return { created, outside }
    },

    onSuccess: ({ created, outside }) => {
      qc.invalidateQueries({ queryKey: docKeys.all(tripId) })
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      const suffix = outside > 0
        ? ` (${outside} fuera de las fechas del viaje: solo como documento)`
        : ''
      toast.success(`${created} ${created === 1 ? 'reserva importada' : 'reservas importadas'}${suffix}`)
    },
    onError: () => toast.error('No se pudo importar la reserva'),
  })
}
