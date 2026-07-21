import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tripKeys } from '@/lib/queries/trips'
import type { InvitePreview, TripCollaborator } from '@/types/database'
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

// Enlace de la invitación, para copiarlo o mandarlo por WhatsApp. Es el mismo
// que lleva el correo: lo abre igual quien ya tiene cuenta y quien no.
export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`

// Manda (o reenvía) el correo de invitación. La función devuelve `skipped`
// cuando no tocaba enviar (ya aceptada, o reenvío demasiado seguido).
async function sendInviteEmail(collaboratorId: string) {
  const { data, error } = await supabase.functions.invoke('send-trip-invite', {
    body: { collaboratorId },
  })
  if (error) {
    // Con un status no-2xx, supabase-js deja `data` a null y solo da un
    // "non-2xx status code" genérico: el motivo real está en el cuerpo.
    const res = (error as { context?: Response }).context
    const body = res ? await res.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message ?? 'No se pudo enviar el correo')
  }
  if (data?.error) throw new Error(data.error)
  return data as { sent?: boolean; skipped?: string; email?: string }
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
      // El acceso ya está dado: si el correo falla no se revierte nada, solo
      // se avisa para que se comparta el enlace a mano.
      const row = data as TripCollaborator
      let mailed = true
      try {
        await sendInviteEmail(row.id)
      } catch {
        mailed = false
      }
      return { row, mailed }
    },
    onSuccess: ({ row, mailed }) => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      if (mailed) toast.success(`Invitación enviada a ${row.email}`)
      else toast.warning('Compartido, pero no se pudo enviar el correo. Copia el enlace y mándaselo.')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'No se pudo compartir el viaje'
      toast.error(msg)
    },
  })
}

// Reenviar el correo a alguien que sigue pendiente.
export function useResendInvite(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sendInviteEmail,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: collaboratorKeys.byTrip(tripId) })
      if (data.skipped === 'cooldown') toast.info('Ya se acaba de enviar; espera un momento')
      else if (data.skipped) toast.info('Esa persona ya está en el viaje')
      else toast.success('Invitación reenviada')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo reenviar la invitación')
    },
  })
}

// Ficha del viaje al que te invitan. Se consulta SIN sesión: es lo que ve
// quien todavía no tiene cuenta antes de decidir crearla.
export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invite', token],
    enabled: !!token,
    retry: false,
    // Nada que cachear entre sesiones: el estado cambia al aceptar.
    gcTime: 0,
    queryFn: async (): Promise<InvitePreview> => {
      const { data, error } = await supabase.rpc('invite_preview', { p_token: token! })
      if (error) throw error
      return data as InvitePreview
    },
  })
}

// Vincula la invitación a la cuenta con la que se ha entrado y devuelve el
// viaje. Funciona aunque el correo de esa cuenta no sea al que se invitó.
export function useAcceptInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      // El viaje recién aceptado tiene que aparecer ya en el dashboard.
      qc.invalidateQueries({ queryKey: tripKeys.all })
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
