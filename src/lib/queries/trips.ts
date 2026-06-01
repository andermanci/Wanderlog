import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Trip } from '@/types/database'
import { toast } from 'sonner'

export const tripKeys = {
  all: ['trips'] as const,
  lists: () => [...tripKeys.all, 'list'] as const,
  detail: (id: string) => [...tripKeys.all, 'detail', id] as const,
}

export function useTrips() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: tripKeys.lists(),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: tripKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Trip, 'id' | 'user_id' | 'created_at'>) => {
      // getSession es rápido (no hace red salvo que el token esté caducado,
      // y entonces refresca vía processLock sin colgarse).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('SESSION_EXPIRED')

      // Timeout duro: si la petición se queda colgada, fallamos en vez de
      // dejar el spinner girando para siempre.
      const insert = supabase
        .from('trips')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      )
      const { data, error } = await Promise.race([insert, timeout])
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      toast.success('Viaje creado correctamente')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : ''
      const code = (err as { code?: string })?.code
      if (msg === 'SESSION_EXPIRED' || code === '42501') {
        toast.error('Tu sesión ha caducado. Recarga la página o vuelve a iniciar sesión.')
      } else if (msg === 'TIMEOUT') {
        toast.error('La operación tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.')
      } else {
        toast.error('Error al crear el viaje')
      }
    },
  })
}

export function useUpdateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Trip> & { id: string }) => {
      const { data, error } = await supabase
        .from('trips')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      qc.invalidateQueries({ queryKey: tripKeys.detail(data.id) })
      toast.success('Viaje actualizado')
    },
    onError: () => toast.error('Error al actualizar el viaje'),
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      toast.success('Viaje eliminado')
    },
    onError: () => toast.error('Error al eliminar el viaje'),
  })
}
