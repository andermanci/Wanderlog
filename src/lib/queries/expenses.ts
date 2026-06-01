import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Expense } from '@/types/database'
import { toast } from 'sonner'

export const expenseKeys = {
  all: (tripId: string) => ['expenses', tripId] as const,
}

export function useExpenses(tripId: string) {
  return useQuery({
    queryKey: expenseKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', tripId)
        .order('date', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Expense, 'id' | 'created_at' | 'external_id' | 'source'>) => {
      const { data, error } = await supabase
        .from('expenses')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all(data.trip_id) })
      toast.success('Gasto registrado')
    },
    onError: () => toast.error('Error al registrar gasto'),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Expense> & { id: string }) => {
      const { data, error } = await supabase
        .from('expenses')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all(data.trip_id) })
      toast.success('Gasto actualizado')
    },
    onError: () => toast.error('Error al actualizar gasto'),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      return { tripId }
    },
    onSuccess: ({ tripId }) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all(tripId) })
      toast.success('Gasto eliminado')
    },
    onError: () => toast.error('Error al eliminar gasto'),
  })
}
