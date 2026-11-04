import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { itineraryKeys } from '@/lib/queries/itinerary'
import type { ItineraryVersion, SnapshotActivity } from '@/types/database'

// Versiones del itinerario (061). Guardar y restaurar van por RPC porque la foto
// la saca la base de datos y restaurar es todo o nada; renombrar, borrar e
// importar una propuesta de Claude son escrituras normales protegidas por RLS.

export const versionKeys = {
  all: (tripId: string) => ['itinerary', 'versions', tripId] as const,
}

export function useItineraryVersions(tripId: string) {
  return useQuery({
    queryKey: versionKeys.all(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itinerary_versions')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ItineraryVersion[]
    },
  })
}

export function useSaveVersion(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('save_itinerary_version', { p_trip_id: tripId, p_name: name })
      if (error) throw error
      return data as ItineraryVersion
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: versionKeys.all(tripId) })
      toast.success(`Versión «${v.name}» guardada`)
    },
    onError: () => toast.error('No se pudo guardar la versión'),
  })
}

export function useRenameVersion(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('itinerary_versions').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: versionKeys.all(tripId) }),
    onError: () => toast.error('No se pudo renombrar la versión'),
  })
}

export function useDeleteVersion(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('itinerary_versions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: versionKeys.all(tripId) })
      toast.success('Versión borrada')
    },
    onError: () => toast.error('No se pudo borrar la versión'),
  })
}

export function useRestoreVersion(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (version: ItineraryVersion) => {
      const { data, error } = await supabase.rpc('restore_itinerary_version', { p_version_id: version.id })
      if (error) throw error
      return { version, result: data }
    },
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      qc.invalidateQueries({ queryKey: versionKeys.all(tripId) })
      toast.success(`Ahora usas «${version.name}». Tu itinerario anterior quedó guardado como versión.`)
    },
    // P0001: la versión tiene días que ya no existen; el mensaje lo explica.
    onError: (e: { code?: string; message?: string }) =>
      toast.error(e.code === 'P0001' && e.message ? e.message : 'No se pudo restaurar la versión'),
  })
}

export interface ImportedProposal {
  name: string
  summary: string | null
  explanations: Record<string, string>
  snapshot: SnapshotActivity[]
}

export function useImportVersion(tripId: string) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async (p: ImportedProposal) => {
      const { data, error } = await supabase
        .from('itinerary_versions')
        .insert({ trip_id: tripId, source: 'claude', created_by: user?.id ?? null, ...p })
        .select()
        .single()
      if (error) throw error
      return data as ItineraryVersion
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: versionKeys.all(tripId) }),
    onError: () => toast.error('No se pudo guardar la propuesta'),
  })
}
