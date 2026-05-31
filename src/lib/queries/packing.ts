import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PackingItem } from '@/types/database'
import { toast } from 'sonner'

export const packingKeys = {
  all: (tripId: string) => ['packing', tripId] as const,
}

export function usePackingItems(tripId: string) {
  return useQuery({
    queryKey: packingKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_items')
        .select('*')
        .eq('trip_id', tripId)
        .order('category')
        .order('order_index')
      if (error) throw error
      return data
    },
  })
}

export function useCreatePackingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<PackingItem, 'id'>) => {
      const { data, error } = await supabase
        .from('packing_items')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: packingKeys.all(data.trip_id) })
    },
    onError: () => toast.error('Error al añadir item'),
  })
}

export function useTogglePackingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_checked, tripId }: { id: string; is_checked: boolean; tripId: string }) => {
      const { error } = await supabase
        .from('packing_items')
        .update({ is_checked })
        .eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: packingKeys.all(tripId) })
    },
  })
}

export function useDeletePackingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('packing_items').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: packingKeys.all(tripId) })
    },
  })
}

export function useBulkCreatePackingItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: Omit<PackingItem, 'id'>[]) => {
      const { data, error } = await supabase
        .from('packing_items')
        .insert(items)
        .select()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      const tripId = data[0]?.trip_id
      if (tripId) qc.invalidateQueries({ queryKey: packingKeys.all(tripId) })
      toast.success(`${data.length} items añadidos`)
    },
    onError: () => toast.error('Error al añadir items'),
  })
}
