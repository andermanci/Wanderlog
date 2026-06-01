import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TripCollaborator } from '@/types/database'
import { toast } from 'sonner'

export const collaboratorKeys = {
  byTrip: (tripId: string) => ['collaborators', tripId] as const,
}

export function useCollaborators(tripId: string) {
  return useQuery({
    queryKey: collaboratorKeys.byTrip(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_collaborators')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return data as TripCollaborator[]
    },
  })
}

export function useShareTrip(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('share_trip', {
        p_trip_id: tripId,
        p_email: email.trim(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      toast.success('Viaje compartido')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'No se pudo compartir el viaje'
      toast.error(msg)
    },
  })
}

export function useRemoveCollaborator(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_collaborators').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      toast.success('Colaborador eliminado')
    },
    onError: () => toast.error('No se pudo eliminar el colaborador'),
  })
}
