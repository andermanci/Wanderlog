import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { expenseKeys } from '@/lib/queries/expenses'
import type { BankConnection } from '@/types/database'
import { toast } from 'sonner'

export const revolutKeys = {
  connection: (tripId: string) => ['bank_connection', tripId] as const,
}

// Conexión bancaria más reciente del viaje (si existe).
export function useRevolutConnection(tripId: string) {
  return useQuery({
    queryKey: revolutKeys.connection(tripId),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_connections')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as BankConnection | null
    },
  })
}

// Inicia el consentimiento y redirige a la pantalla de Revolut/GoCardless.
export function useConnectRevolut(tripId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('revolut-connect', {
        body: { tripId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.link) throw new Error('No se recibió el enlace de conexión')
      return data.link as string
    },
    onSuccess: (link) => {
      window.location.href = link
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar con Revolut')
    },
  })
}

export interface RevolutCandidate {
  external_id: string
  date: string
  amount: number
  currency: string
  description: string
  inTripRange: boolean
  alreadyImported: boolean
}

// Lista los movimientos candidatos (no importa nada).
export function usePreviewRevolut(tripId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('revolut-sync', {
        body: { tripId, mode: 'preview' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { candidates: RevolutCandidate[]; pending?: boolean }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudieron leer los movimientos')
    },
  })
}

// Importa como gastos solo los movimientos seleccionados.
export function useImportRevolut(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (externalIds: string[]) => {
      const { data, error } = await supabase.functions.invoke('revolut-sync', {
        body: { tripId, mode: 'import', externalIds },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { imported: number; skipped: number }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: expenseKeys.all(tripId) })
      qc.invalidateQueries({ queryKey: revolutKeys.connection(tripId) })
      toast.success(`Importados ${res.imported} gastos`)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudieron importar los gastos')
    },
  })
}
