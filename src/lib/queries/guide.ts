import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, DestinationGuide, GuideSection } from '@/types/database'
import { toast } from 'sonner'

type GuideInsert = Database['public']['Tables']['destination_guides']['Insert']

export const guideKeys = {
  all: (tripId: string) => ['destination-guide', tripId] as const,
}

export function useDestinationGuide(tripId: string) {
  return useQuery({
    queryKey: guideKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destination_guides')
        .select('*')
        .eq('trip_id', tripId)
        .maybeSingle()
      if (error) throw error
      return (data as DestinationGuide | null)
    },
  })
}

export function useSaveDestinationGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tripId, sections, markImported }: { tripId: string; sections: GuideSection[]; markImported?: boolean }) => {
      const payload: GuideInsert = {
        trip_id: tripId,
        sections,
        updated_at: new Date().toISOString(),
        ...(markImported ? { imported_at: new Date().toISOString() } : {}),
      }
      const { data, error } = await supabase
        .from('destination_guides')
        .upsert(payload, { onConflict: 'trip_id' })
        .select()
        .single()
      if (error) throw error
      return data as DestinationGuide
    },
    onSuccess: (data) => {
      qc.setQueryData(guideKeys.all(data.trip_id), data)
    },
    onError: () => toast.error('No se pudo guardar la guía'),
  })
}
