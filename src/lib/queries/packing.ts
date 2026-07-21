import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enqueue, isNetworkError } from '@/lib/offline'
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

// Marca/desmarca una prenda de la lista. Actualización optimista para que la
// casilla responda al instante, y cola offline: hacer la maleta en un hotel sin
// wifi es el caso normal, y antes el tap no hacía nada ni avisaba de por qué.
export function useTogglePackingItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_checked, tripId }: { id: string; is_checked: boolean; tripId: string }): Promise<{ pending: boolean }> => {
      const queueOffline = () => {
        enqueue({ id: crypto.randomUUID(), kind: 'packing.toggle', payload: { item_id: id, trip_id: tripId, is_checked } })
        return { pending: true }
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) return queueOffline()
      try {
        const { error } = await supabase
          .from('packing_items')
          .update({ is_checked })
          .eq('id', id)
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
    onMutate: async ({ id, is_checked, tripId }) => {
      const key = packingKeys.all(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<PackingItem[]>(key)
      qc.setQueryData<PackingItem[]>(key, (old) => old?.map(i => i.id === id ? { ...i, is_checked } : i))
      return { prev, tripId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.tripId && ctx.prev) qc.setQueryData(packingKeys.all(ctx.tripId), ctx.prev)
      toast.error('No se pudo actualizar')
    },
    onSettled: (data, _e, { tripId }) => {
      if (data?.pending) return
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
