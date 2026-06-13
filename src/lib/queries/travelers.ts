import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Traveler } from '@/types/database'
import { toast } from 'sonner'

export const travelerKeys = {
  all: (tripId: string) => ['travelers', tripId] as const,
}

export function useTravelers(tripId: string) {
  return useQuery({
    queryKey: travelerKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travelers')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCreateTraveler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<Traveler, 'trip_id' | 'name'> & { is_self?: boolean }) => {
      const { data, error } = await supabase.from('travelers').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: travelerKeys.all(data.trip_id) })
      toast.success('Viajero añadido')
    },
    onError: () => toast.error('Error al añadir viajero'),
  })
}

export function useUpdateTraveler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Traveler> & { id: string }) => {
      const { data, error } = await supabase.from('travelers').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: travelerKeys.all(data.trip_id) })
    },
    onError: () => toast.error('Error al actualizar viajero'),
  })
}

export function useDeleteTraveler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('travelers').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: travelerKeys.all(tripId) })
      // Los documentos quedan con traveler_id = null (on delete set null).
      qc.invalidateQueries({ queryKey: ['documents', tripId] })
      toast.success('Viajero eliminado')
    },
    onError: () => toast.error('Error al eliminar viajero'),
  })
}
