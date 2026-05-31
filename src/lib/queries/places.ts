import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { FavoritePlace } from '@/types/database'
import { toast } from 'sonner'

export const placeKeys = {
  all: (tripId: string) => ['places', tripId] as const,
}

export function useFavoritePlaces(tripId: string) {
  return useQuery({
    queryKey: placeKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorite_places')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useSaveFavoritePlace() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async (values: Omit<FavoritePlace, 'id' | 'user_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('favorite_places')
        .insert({ ...values, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: placeKeys.all(data.trip_id) })
      toast.success('Lugar guardado en favoritos')
    },
    onError: () => toast.error('Error al guardar el lugar'),
  })
}

export function useDeleteFavoritePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('favorite_places').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: placeKeys.all(tripId) })
      toast.success('Lugar eliminado de favoritos')
    },
    onError: () => toast.error('Error al eliminar el lugar'),
  })
}

export function useUpdateFavoritePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<FavoritePlace> & { id: string }) => {
      const { data, error } = await supabase
        .from('favorite_places')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: placeKeys.all(data.trip_id) })
      toast.success('Lugar actualizado')
    },
    onError: () => toast.error('Error al actualizar el lugar'),
  })
}
