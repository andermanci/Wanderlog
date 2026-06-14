import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, DestinationGuide, GuideSection, GuideFacts } from '@/types/database'
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
        .order('order_index')
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
      // order_index al final de la lista actual.
      const { count } = await supabase
        .from('destination_guides')
        .select('*', { count: 'exact', head: true })
        .eq('trip_id', tripId)
      const { data, error } = await supabase
        .from('destination_guides')
        .insert({ trip_id: tripId, name, sections: [], order_index: count ?? 0 })
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
    mutationFn: async ({ id, tripId, name, sections, coverImageUrl, facts, markImported }: {
      id: string; tripId: string; name?: string; sections?: GuideSection[]
      coverImageUrl?: string | null; facts?: GuideFacts; markImported?: boolean
    }) => {
      const patch: GuideUpdate = { updated_at: new Date().toISOString() }
      if (name !== undefined) patch.name = name
      if (sections !== undefined) patch.sections = sections
      if (coverImageUrl !== undefined) patch.cover_image_url = coverImageUrl
      if (facts !== undefined) patch.facts = facts
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
    onMutate: async ({ id, tripId, name, sections, coverImageUrl, facts }) => {
      const key = guideKeys.all(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<DestinationGuide[]>(key)
      qc.setQueryData<DestinationGuide[]>(key, (old) =>
        old?.map(g => g.id === id ? {
          ...g,
          ...(name !== undefined ? { name } : {}),
          ...(sections !== undefined ? { sections } : {}),
          ...(coverImageUrl !== undefined ? { cover_image_url: coverImageUrl } : {}),
          ...(facts !== undefined ? { facts } : {}),
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

// Reordena los destinos (drag). Actualiza order_index de cada guía.
export function useReorderGuides() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tripId, order }: { tripId: string; order: { id: string; order_index: number }[] }) => {
      await Promise.all(order.map(o =>
        supabase.from('destination_guides').update({ order_index: o.order_index }).eq('id', o.id),
      ))
      return { tripId }
    },
    onMutate: async ({ tripId, order }) => {
      const key = guideKeys.all(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<DestinationGuide[]>(key)
      const rank = new Map(order.map(o => [o.id, o.order_index]))
      qc.setQueryData<DestinationGuide[]>(key, (old) =>
        old ? [...old].map(g => rank.has(g.id) ? { ...g, order_index: rank.get(g.id)! } : g)
          .sort((a, b) => a.order_index - b.order_index) : old,
      )
      return { prev, tripId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.tripId && ctx.prev) qc.setQueryData(guideKeys.all(ctx.tripId), ctx.prev)
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
