import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Activity, ItineraryDay } from '@/types/database'
import { toast } from 'sonner'

export const itineraryKeys = {
  days: (tripId: string) => ['itinerary', 'days', tripId] as const,
  activities: (tripId: string) => ['itinerary', 'activities', tripId] as const,
  today: () => ['itinerary', 'today'] as const,
}

export type TodayActivity = Activity & {
  trips: { name: string; destination: string } | null
}

// Actividades del itinerario cuya fecha de día es HOY, en todos los viajes
// accesibles del usuario. Para el panel "Hoy" del dashboard.
export function useTodayActivities() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: itineraryKeys.today(),
    enabled: !!user,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('activities')
        .select('*, itinerary_days!inner(date), trips(name, destination)')
        .eq('itinerary_days.date', today)
        .order('start_time', { ascending: true, nullsFirst: true })
      if (error) throw error
      return data as unknown as TodayActivity[]
    },
  })
}

export function useItineraryDays(tripId: string) {
  return useQuery({
    queryKey: itineraryKeys.days(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('trip_id', tripId)
        .order('date')
      if (error) throw error
      return data
    },
  })
}

export function useActivities(tripId: string) {
  return useQuery({
    queryKey: itineraryKeys.activities(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('trip_id', tripId)
        .order('order_index')
      if (error) throw error
      return data
    },
  })
}

export function useUpsertDays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (days: Array<{ trip_id: string; date: string; notes?: string | null }>) => {
      const { data, error } = await supabase
        .from('itinerary_days')
        .upsert(days, { onConflict: 'trip_id,date' })
        .select()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      const tripId = vars[0]?.trip_id
      if (tripId) qc.invalidateQueries({ queryKey: itineraryKeys.days(tripId) })
    },
  })
}

export function useCreateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Activity, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('activities')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(data.trip_id) })
      toast.success('Actividad añadida')
    },
    onError: () => toast.error('Error al añadir actividad'),
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Activity> & { id: string }) => {
      const { data, error } = await supabase
        .from('activities')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(data.trip_id) })
      toast.success('Actividad actualizada')
    },
    onError: () => toast.error('Error al actualizar actividad'),
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      toast.success('Actividad eliminada')
    },
    onError: () => toast.error('Error al eliminar actividad'),
  })
}

export function useReorderActivities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Array<{ id: string; day_id: string; order_index: number; trip_id: string }>) => {
      const promises = updates.map(({ id, day_id, order_index }) =>
        supabase.from('activities').update({ day_id, order_index }).eq('id', id)
      )
      await Promise.all(promises)
      return updates
    },
    onSuccess: (data) => {
      const tripId = data[0]?.trip_id
      if (tripId) qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
    },
  })
}

export function useUpdateDayNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, notes, tripId }: { id: string; notes: string; tripId: string }) => {
      const { error } = await supabase.from('itinerary_days').update({ notes }).eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.days(tripId) })
    },
  })
}
