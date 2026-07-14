import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TripCollaborator } from '@/types/database'
import { toast } from 'sonner'

export const collaboratorKeys = {
  byTrip: (tripId: string) => ['collaborators', tripId] as const,
  myRole: (tripId: string) => ['collaborators', 'myRole', tripId] as const,
}

export type TripRole = 'owner' | 'admin' | 'editor' | 'viewer'

export const ROLE_LABELS: Record<Exclude<TripRole, 'owner'>, string> = {
  viewer: 'Ver',
  editor: 'Editar',
  admin: 'Editar y compartir',
}

// Rol efectivo del usuario actual en el viaje ('owner' si es suyo).
// Sirve para ocultar en la UI lo que la RLS bloquearía de todas formas.
export function useTripRole(tripId: string) {
  return useQuery({
    queryKey: collaboratorKeys.myRole(tripId),
    enabled: !!tripId,
    queryFn: async (): Promise<TripRole | null> => {
      const { data, error } = await supabase.rpc('my_trip_role', { p_trip_id: tripId })
      if (error) throw error
      return data
    },
  })
}

export const canEditRole = (role: TripRole | null | undefined) =>
  role === 'owner' || role === 'admin' || role === 'editor'
export const canShareRole = (role: TripRole | null | undefined) =>
  role === 'owner' || role === 'admin'

export function useCollaborators(tripId: string) {
  return useQuery({
    queryKey: collaboratorKeys.byTrip(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_collaborators')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at')
      if (error) throw error
      return data as TripCollaborator[]
    },
  })
}

export function useShareTrip(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('share_trip', {
        p_trip_id: tripId,
        p_email: email.trim(),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      toast.success('Viaje compartido')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'No se pudo compartir el viaje'
      toast.error(msg)
    },
  })
}

// Cambiar el nivel de un colaborador (la RLS solo lo permite al dueño).
export function useSetCollaboratorRole(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: TripCollaborator['role'] }) => {
      const { error } = await supabase.from('trip_collaborators').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      toast.success('Permiso actualizado')
    },
    onError: () => toast.error('No se pudo cambiar el permiso'),
  })
}

export function useRemoveCollaborator(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_collaborators').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      toast.success('Colaborador eliminado')
    },
    onError: () => toast.error('No se pudo eliminar el colaborador'),
  })
}
