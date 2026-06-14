import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, DestinationGuide, GuideSection } from '@/types/database'
import { toast } from 'sonner'

type GuideUpdate = Database['public']['Tables']['destination_guides']['Update']

export const guideKeys = {
  all: (tripId: string) => ['destination-guides', tripId] as const,
}

// Lista de guías de destino del viaje (Singapur, Bali, ...).
export function useDestinationGuides(tripId: string) {
  return useQuery({
    queryKey: guideKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destination_guides')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as DestinationGuide[]
    },
  })
}

export function useAddDestinationGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tripId, name }: { tripId: string; name: string }) => {
      const { data, error } = await supabase
        .from('destination_guides')
        .insert({ trip_id: tripId, name, sections: [] })
        .select()
        .single()
      if (error) throw error
      return data as DestinationGuide
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: guideKeys.all(data.trip_id) })
    },
    onError: () => toast.error('No se pudo añadir el destino'),
  })
}

export function useUpdateDestinationGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId, name, sections, markImported }: {
      id: string; tripId: string; name?: string; sections?: GuideSection[]; markImported?: boolean
    }) => {
      const patch: GuideUpdate = { updated_at: new Date().toISOString() }
      if (name !== undefined) patch.name = name
      if (sections !== undefined) patch.sections = sections
      if (markImported) patch.imported_at = new Date().toISOString()
      const { data, error } = await supabase
        .from('destination_guides')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DestinationGuide
    },
    onMutate: async ({ id, tripId, name, sections }) => {
      const key = guideKeys.all(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<DestinationGuide[]>(key)
      qc.setQueryData<DestinationGuide[]>(key, (old) =>
        old?.map(g => g.id === id ? {
          ...g,
          ...(name !== undefined ? { name } : {}),
          ...(sections !== undefined ? { sections } : {}),
        } : g),
      )
      return { prev, tripId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.tripId && ctx.prev) qc.setQueryData(guideKeys.all(ctx.tripId), ctx.prev)
      toast.error('No se pudo guardar')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: guideKeys.all(vars.tripId) })
    },
  })
}

export function useDeleteDestinationGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('destination_guides').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: guideKeys.all(vars.tripId) })
    },
    onError: () => toast.error('No se pudo eliminar el destino'),
  })
}
