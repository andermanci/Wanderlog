import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enqueue, isNetworkError } from '@/lib/offline'
import type { Expense } from '@/types/database'
import { toast } from 'sonner'

// Gasto con marca local de "pendiente de subir" (creado sin conexión).
export type PendingExpense = Expense & { _pending?: boolean }

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
    mutationFn: async (values: Omit<Expense, 'id' | 'created_at' | 'external_id' | 'source'>): Promise<PendingExpense> => {
      // Generamos el id en cliente: permite encolar el gasto offline y que el
      // reintento sea idempotente (mismo id ⇒ el duplicado se descarta).
      const row: Expense = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        external_id: null,
        source: 'manual',
        ...values,
      }

      const queueOffline = (): PendingExpense => {
        enqueue({ id: row.id, kind: 'expense.create', payload: row })
        return { ...row, _pending: true }
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) return queueOffline()

      try {
        const { data, error } = await supabase.from('expenses').insert(row).select().single()
        if (error) {
          if (isNetworkError(error)) return queueOffline()
          throw error
        }
        return data
      } catch (e) {
        if (isNetworkError(e)) return queueOffline()
        throw e
      }
    },
    onSuccess: (data) => {
      if (data._pending) {
        // Sin conexión: lo añadimos a la caché local (persistida) y se subirá solo.
        qc.setQueryData<PendingExpense[]>(expenseKeys.all(data.trip_id), (old) =>
          [data, ...(old ?? [])])
        toast.info('Sin conexión: gasto guardado, se subirá al reconectar')
      } else {
        qc.invalidateQueries({ queryKey: expenseKeys.all(data.trip_id) })
        toast.success('Gasto registrado')
      }
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
