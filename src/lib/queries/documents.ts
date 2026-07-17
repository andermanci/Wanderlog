import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itineraryKeys } from '@/lib/queries/itinerary'
import type { Document } from '@/types/database'
import { toast } from 'sonner'

export const docKeys = {
  all: (tripId: string) => ['documents', tripId] as const,
}

export function useDocuments(tripId: string) {
  return useQuery({
    queryKey: docKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('trip_id', tripId)
        .order('datetime_start', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
}

// activity_id solo lo rellena la importación de .ics (que enlaza la reserva con
// su actividad del itinerario); el formulario de a mano no lo pide.
export type NewDocument =
  Omit<Document, 'id' | 'created_at' | 'activity_id'>
  & Partial<Pick<Document, 'activity_id'>>

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: NewDocument) => {
      const { data, error } = await supabase
        .from('documents')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: docKeys.all(data.trip_id) })
      toast.success('Documento añadido')
    },
    onError: () => toast.error('Error al añadir documento'),
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Document> & { id: string }) => {
      const { data, error } = await supabase
        .from('documents')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: docKeys.all(data.trip_id) })
      toast.success('Documento actualizado')
    },
    onError: () => toast.error('Error al actualizar documento'),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    // activityId: si la reserva estaba en el itinerario, se borra también su
    // actividad espejo (quedan sincronizadas).
    mutationFn: async ({ id, tripId, activityId }: { id: string; tripId: string; activityId?: string | null }) => {
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
      if (activityId) {
        const { error: actError } = await supabase.from('activities').delete().eq('id', activityId)
        if (actError) throw actError
      }
      return { tripId, hadActivity: !!activityId }
    },
    onSuccess: ({ tripId, hadActivity }) => {
      qc.invalidateQueries({ queryKey: docKeys.all(tripId) })
      if (hadActivity) qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      toast.success('Documento eliminado')
    },
    onError: () => toast.error('Error al eliminar documento'),
  })
}

// Devuelve el PATH dentro del bucket (privado), no una URL pública: se guarda
// así en la BD y se resuelve al pintarlo con `useDocUrl`. El segundo segmento
// del path es el viaje, y la política de RLS del bucket lo usa para dar acceso
// a los colaboradores.
export async function uploadDocumentFile(
  file: File,
  userId: string,
  tripId: string
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${tripId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) throw error
  return path
}
