import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Activity, ItineraryDay } from '@/types/database'
import { toast } from 'sonner'

// Sube una foto de portada de actividad al bucket público (offline-cacheable).
export async function uploadActivityCover(file: File, userId: string, tripId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${tripId}/covers/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file)
  if (error) throw error
  return supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
}

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
    mutationFn: async (values: Omit<Activity, 'id' | 'created_at' | 'day_orders'>) => {
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

// Cada update es heterogéneo: las actividades normales cambian day_id+order_index;
// los hoteles (banner multi-día) solo cambian su mapa de orden por día `day_orders`.
type ReorderUpdate = {
  id: string
  trip_id: string
  day_id?: string
  order_index?: number
  day_orders?: Record<string, number>
}

export function useReorderActivities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: ReorderUpdate[]) => {
      const promises = updates.map(({ id, trip_id: _t, ...patch }) =>
        supabase.from('activities').update(patch).eq('id', id)
      )
      await Promise.all(promises)
      return updates
    },
    // Actualización optimista: el nuevo orden se ve al instante (sin esperar al
    // servidor), así el arrastrar-soltar no "salta" al sitio anterior. Solo se
    // fusionan los campos presentes en cada update.
    onMutate: async (updates) => {
      const tripId = updates[0]?.trip_id
      if (!tripId) return {}
      const key = itineraryKeys.activities(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Activity[]>(key)
      const byId = new Map(updates.map(u => [u.id, u]))
      qc.setQueryData<Activity[]>(key, (old) =>
        old?.map(a => {
          const u = byId.get(a.id)
          if (!u) return a
          const { id: _id, trip_id: _t, ...patch } = u
          return { ...a, ...patch }
        }),
      )
      return { prev, tripId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.tripId && ctx.prev) qc.setQueryData(itineraryKeys.activities(ctx.tripId), ctx.prev)
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (ctx?.tripId) qc.invalidateQueries({ queryKey: itineraryKeys.activities(ctx.tripId) })
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

// Asigna (o quita) la ciudad/guía de destino de un día. guide_id = null lo desasocia.
export function useUpdateDayGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, guideId, tripId }: { id: string; guideId: string | null; tripId: string }) => {
      const { error } = await supabase.from('itinerary_days').update({ guide_id: guideId }).eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onMutate: async ({ id, guideId, tripId }) => {
      const key = itineraryKeys.days(tripId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ItineraryDay[]>(key)
      qc.setQueryData<ItineraryDay[]>(key, (old) => old?.map(d => d.id === id ? { ...d, guide_id: guideId } : d))
      return { prev, tripId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.tripId && ctx.prev) qc.setQueryData(itineraryKeys.days(ctx.tripId), ctx.prev)
      toast.error('No se pudo asignar la ciudad')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.days(vars.tripId) })
    },
  })
}
