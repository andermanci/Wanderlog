import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { reminderKeys } from '@/lib/queries/reminders'
import type { DayAlert, DayAlertLevel } from '@/types/database'
import { toast } from 'sonner'

export const dayAlertKeys = {
  byTrip: (tripId: string) => ['day_alerts', 'trip', tripId] as const,
}

export function useDayAlerts(tripId: string) {
  return useQuery({
    queryKey: dayAlertKeys.byTrip(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_alerts')
        .select('*')
        .eq('trip_id', tripId)
        .order('order_index')
        .order('created_at')
      if (error) throw error
      return data as DayAlert[]
    },
  })
}

// Crea (o quita) el reminder enlazado a una alerta, devolviendo el id resultante.
// remind_at = null desprograma; un ISO string programa/actualiza. Reutiliza el
// pipeline de notificaciones existente (tabla reminders + send-reminders + push).
async function syncReminder(opts: {
  userId: string
  tripId: string
  title: string
  remindAt: string | null
  currentReminderId: string | null
}): Promise<string | null> {
  const { userId, tripId, title, remindAt, currentReminderId } = opts

  if (remindAt) {
    if (currentReminderId) {
      const { error } = await supabase
        .from('reminders')
        .update({ title, remind_at: remindAt, is_sent: false })
        .eq('id', currentReminderId)
      if (error) throw error
      return currentReminderId
    }
    const { data, error } = await supabase
      .from('reminders')
      .insert({ trip_id: tripId, activity_id: null, user_id: userId, title, remind_at: remindAt, type: 'custom', is_sent: false })
      .select()
      .single()
    if (error) throw error
    return data.id
  }

  // Sin aviso: borrar el reminder previo si existía.
  if (currentReminderId) {
    await supabase.from('reminders').delete().eq('id', currentReminderId)
  }
  return null
}

type CreateInput = {
  trip_id: string
  day_id: string
  text: string
  level: DayAlertLevel
  order_index: number
  remind_at?: string | null
}

export function useCreateDayAlert() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ trip_id, day_id, text, level, order_index, remind_at }: CreateInput) => {
      const reminderId = await syncReminder({
        userId: user!.id, tripId: trip_id, title: text, remindAt: remind_at ?? null, currentReminderId: null,
      })
      const { data, error } = await supabase
        .from('day_alerts')
        .insert({ trip_id, day_id, text, level, order_index, reminder_id: reminderId })
        .select()
        .single()
      if (error) throw error
      return data as DayAlert
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: dayAlertKeys.byTrip(data.trip_id) })
      qc.invalidateQueries({ queryKey: reminderKeys.byTrip(data.trip_id) })
      qc.invalidateQueries({ queryKey: reminderKeys.pending() })
      toast.success('Alerta añadida')
    },
    onError: () => toast.error('Error al añadir la alerta'),
  })
}

type UpdateInput = {
  id: string
  trip_id: string
  text: string
  level: DayAlertLevel
  remind_at: string | null
  currentReminderId: string | null
}

export function useUpdateDayAlert() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async ({ id, trip_id, text, level, remind_at, currentReminderId }: UpdateInput) => {
      const reminderId = await syncReminder({
        userId: user!.id, tripId: trip_id, title: text, remindAt: remind_at, currentReminderId,
      })
      const { error } = await supabase
        .from('day_alerts')
        .update({ text, level, reminder_id: reminderId })
        .eq('id', id)
      if (error) throw error
      return { trip_id }
    },
    onSuccess: ({ trip_id }) => {
      qc.invalidateQueries({ queryKey: dayAlertKeys.byTrip(trip_id) })
      qc.invalidateQueries({ queryKey: reminderKeys.byTrip(trip_id) })
      qc.invalidateQueries({ queryKey: reminderKeys.pending() })
      toast.success('Alerta actualizada')
    },
    onError: () => toast.error('Error al actualizar la alerta'),
  })
}

export function useDeleteDayAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId, reminderId }: { id: string; tripId: string; reminderId: string | null }) => {
      const { error } = await supabase.from('day_alerts').delete().eq('id', id)
      if (error) throw error
      if (reminderId) await supabase.from('reminders').delete().eq('id', reminderId)
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: dayAlertKeys.byTrip(tripId) })
      qc.invalidateQueries({ queryKey: reminderKeys.byTrip(tripId) })
      qc.invalidateQueries({ queryKey: reminderKeys.pending() })
      toast.success('Alerta eliminada')
    },
    onError: () => toast.error('Error al eliminar la alerta'),
  })
}
