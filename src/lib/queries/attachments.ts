import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActivityAttachment } from '@/types/database'
import { toast } from 'sonner'

export const attachmentKeys = {
  byActivity: (activityId: string) => ['attachments', 'activity', activityId] as const,
  byTrip: (tripId: string) => ['attachments', 'trip', tripId] as const,
}

// Todos los adjuntos del viaje (para pintar miniaturas en el itinerario).
export function useTripAttachments(tripId: string) {
  return useQuery({
    queryKey: attachmentKeys.byTrip(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_attachments')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return data as ActivityAttachment[]
    },
  })
}

export async function uploadAttachmentFile(
  file: File,
  userId: string,
  tripId: string,
  activityId: string,
): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${tripId}/${activityId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

export function useAddAttachment(tripId: string, activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { name: string; file_url: string; mime: string | null }) => {
      const { data, error } = await supabase
        .from('activity_attachments')
        .insert({ activity_id: activityId, trip_id: tripId, ...values })
        .select()
        .single()
      if (error) throw error
      return data as ActivityAttachment
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentKeys.byTrip(tripId) })
      toast.success('Adjunto guardado')
    },
    onError: () => toast.error('No se pudo guardar el adjunto'),
  })
}

export function useDeleteAttachment(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('activity_attachments')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      // Si no se borró ninguna fila (p. ej. sesión sin permisos), avisamos.
      if (!data || data.length === 0) throw new Error('NO_ROWS')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentKeys.byTrip(tripId) })
      toast.success('Adjunto eliminado')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && err.message === 'NO_ROWS'
        ? 'No se pudo eliminar (sesión sin permiso). Recarga la página e inténtalo de nuevo.'
        : 'No se pudo eliminar el adjunto'
      toast.error(msg)
    },
  })
}
