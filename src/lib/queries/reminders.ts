import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Reminder } from '@/types/database'
import { toast } from 'sonner'

export const reminderKeys = {
  all: ['reminders'] as const,
  byTrip: (tripId: string) => ['reminders', 'trip', tripId] as const,
  pending: () => ['reminders', 'pending'] as const,
}

export function useReminders(tripId: string) {
  return useQuery({
    queryKey: reminderKeys.byTrip(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('trip_id', tripId)
        .order('remind_at')
      if (error) throw error
      return data
    },
  })
}

export function usePendingReminders() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: reminderKeys.pending(),
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*, trips(name, destination)')
        .eq('user_id', user!.id)
        .eq('is_sent', false)
        .gte('remind_at', new Date().toISOString())
        .order('remind_at')
        .limit(10)
      if (error) throw error
      return data as (Reminder & { trips: { name: string; destination: string } | null })[]
    },
  })
}

export function useCreateReminder() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async (values: Omit<Reminder, 'id' | 'user_id' | 'created_at' | 'is_sent'>) => {
      const { data, error } = await supabase
        .from('reminders')
        .insert({ ...values, user_id: user!.id, is_sent: false })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: reminderKeys.byTrip(data.trip_id) })
      qc.invalidateQueries({ queryKey: reminderKeys.pending() })
      toast.success('Recordatorio creado')
    },
    onError: () => toast.error('Error al crear recordatorio'),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: reminderKeys.byTrip(tripId) })
      qc.invalidateQueries({ queryKey: reminderKeys.pending() })
      toast.success('Recordatorio eliminado')
    },
    onError: () => toast.error('Error al eliminar recordatorio'),
  })
}
