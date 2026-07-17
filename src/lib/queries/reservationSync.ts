import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { docKeys } from '@/lib/queries/documents'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { docToActivityFields } from '@/lib/reservationLink'
import type { Document, ItineraryDay } from '@/types/database'
import { toast } from 'sonner'

// Sincroniza la ACTIVIDAD espejo de una reserva con el toggle "Mostrar en el
// itinerario", manteniendo documents.activity_id al día:
//  - toggle ON y fecha dentro del viaje → crea o actualiza la actividad.
//  - toggle OFF (o fuera de rango) → borra la actividad enlazada y desvincula.
// Mismo patrón que la importación de .ics (lib/queries/icsImport.ts).
export function useSyncReservation(tripId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ doc, showInItinerary }: { doc: Document; showInItinerary: boolean }) => {
      const { data: days, error: daysError } = await supabase
        .from('itinerary_days')
        .select('id, date')
        .eq('trip_id', tripId)
      if (daysError) throw daysError

      const dayIdByDate = new Map(
        (days as Pick<ItineraryDay, 'id' | 'date'>[]).map(d => [d.date, d.id]),
      )
      const target = showInItinerary ? docToActivityFields(doc, dayIdByDate) : null

      // Sin sitio en el itinerario: si había actividad espejo, se borra y se
      // desvincula el documento.
      if (!target) {
        if (doc.activity_id) {
          const { error } = await supabase.from('activities').delete().eq('id', doc.activity_id)
          if (error) throw error
          await supabase.from('documents').update({ activity_id: null }).eq('id', doc.id)
        }
        return
      }

      if (doc.activity_id) {
        const { error } = await supabase.from('activities').update(target).eq('id', doc.activity_id)
        if (error) throw error
      } else {
        const { data: activity, error } = await supabase
          .from('activities')
          .insert({ trip_id: tripId, order_index: 0, ...target })
          .select('id')
          .single()
        if (error) throw error
        const { error: linkError } = await supabase
          .from('documents')
          .update({ activity_id: activity.id })
          .eq('id', doc.id)
        if (linkError) throw linkError
      }
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.all(tripId) })
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
    },
    onError: () => toast.error('No se pudo sincronizar con el itinerario'),
  })
}
