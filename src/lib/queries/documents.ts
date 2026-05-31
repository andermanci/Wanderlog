import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Document, 'id' | 'created_at'>) => {
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
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: docKeys.all(tripId) })
      toast.success('Documento eliminado')
    },
    onError: () => toast.error('Error al eliminar documento'),
  })
}

export async function uploadDocumentFile(
  file: File,
  userId: string,
  tripId: string
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${tripId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('documents').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return data.publicUrl
}
