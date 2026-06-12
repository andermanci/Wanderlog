import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { enqueue, isNetworkError } from '@/lib/offline'
import type { ItineraryDay, JournalPhoto } from '@/types/database'
import { toast } from 'sonner'

export const journalKeys = {
  photos: (tripId: string) => ['journal', 'photos', tripId] as const,
}

// Todas las fotos del diario del viaje (se agrupan por día en la UI).
export function useJournalPhotos(tripId: string) {
  return useQuery({
    queryKey: journalKeys.photos(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_photos')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return data as JournalPhoto[]
    },
  })
}

// Guarda el texto del diario de un día. Funciona offline: el cambio se aplica
// a la caché local y se encola para subirse al reconectar.
export function useUpdateDayJournal(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ dayId, journal }: { dayId: string; journal: string }): Promise<{ pending: boolean }> => {
      const queueOffline = () => {
        enqueue({ id: crypto.randomUUID(), kind: 'journal.update', payload: { day_id: dayId, trip_id: tripId, journal } })
        return { pending: true }
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) return queueOffline()
      try {
        const { error } = await supabase.from('itinerary_days').update({ journal }).eq('id', dayId)
        if (error) {
          if (isNetworkError(error)) return queueOffline()
          throw error
        }
        return { pending: false }
      } catch (e) {
        if (isNetworkError(e)) return queueOffline()
        throw e
      }
    },
    onSuccess: ({ pending }, { dayId, journal }) => {
      // Actualiza la caché local en ambos casos (persiste offline).
      qc.setQueryData<ItineraryDay[]>(itineraryKeys.days(tripId), (old) =>
        old?.map(d => d.id === dayId ? { ...d, journal } : d))
      if (pending) toast.info('Sin conexión: diario guardado, se subirá al reconectar')
      else toast.success('Diario guardado')
    },
    onError: () => toast.error('No se pudo guardar el diario'),
  })
}

export async function uploadJournalPhoto(
  file: File,
  userId: string,
  tripId: string,
  dayId: string,
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${tripId}/journal/${dayId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

export function useAddJournalPhoto(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ dayId, fileUrl }: { dayId: string; fileUrl: string }) => {
      const { data, error } = await supabase
        .from('journal_photos')
        .insert({ trip_id: tripId, day_id: dayId, file_url: fileUrl })
        .select()
        .single()
      if (error) throw error
      return data as JournalPhoto
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: journalKeys.photos(tripId) }),
    onError: () => toast.error('No se pudo guardar la foto'),
  })
}

export function useDeleteJournalPhoto(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_photos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.photos(tripId) })
      toast.success('Foto eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la foto'),
  })
}
