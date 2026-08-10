import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type {
  AdminItineraryRow, AdminMetrics, AdminTripOverview, AdminTripRow,
  AdminUserRow, AdminUserTripRow, AdminEvents, DeleteUserPreviewRow,
} from '@/types/database'
import type { Resumen } from '@/lib/analytics/aggregate'

// Todas las claves cuelgan de 'admin' y eso NO es cosmético: el persister de
// App.tsx excluye ese prefijo de localStorage. Son datos de otras personas y
// no tienen por qué sobrevivir a la pestaña, y menos los 60 días de maxAge
// que tiene el resto de la caché.
export const adminKeys = {
  all: ['admin'] as const,
  esAdmin: () => [...adminKeys.all, 'soy'] as const,
  auditoria: (page: number) => [...adminKeys.all, 'auditoria', page] as const,
  metricas: (dias: number) => [...adminKeys.all, 'metricas', dias] as const,
  usuarios: (q: string, page: number) => [...adminKeys.all, 'usuarios', q, page] as const,
  usuario: (userId: string) => [...adminKeys.all, 'usuario', userId] as const,
  viajesDe: (userId: string) => [...adminKeys.all, 'viajesDe', userId] as const,
  viajes: (q: string, page: number) => [...adminKeys.all, 'viajes', q, page] as const,
  viaje: (tripId: string) => [...adminKeys.all, 'viaje', tripId] as const,
  itinerario: (tripId: string) => [...adminKeys.all, 'itinerario', tripId] as const,
  visitas: (dias: number) => [...adminKeys.all, 'visitas', dias] as const,
  ultimaVista: () => [...adminKeys.all, 'ultimaVista'] as const,
  eventos: (dias: number) => [...adminKeys.all, 'eventos', dias] as const,
  previoBorrado: (userId: string) => [...adminKeys.all, 'previoBorrado', userId] as const,
}

// Tamaño de página de las listas. PostgREST corta a 1000 filas en silencio,
// así que en el panel no hay ni una consulta sin límite.
export const PAGINA = 50

// ¿El usuario actual administra la plataforma?
//
// Se pregunta por RPC y no con un select sobre `app_admins` porque esa tabla
// tiene RLS sin políticas: un select devolvería [] SIN error, y ese [] es
// indistinguible de "no soy admin", "la tabla no existe" y "alguien cambió la
// política". La RPC devuelve un booleano explícito, y además no permite
// preguntar por terceros (no acepta parámetro), así que no sirve para
// enumerar quién administra.
export function useIsAdmin() {
  const { session } = useAuthStore()
  return useQuery({
    queryKey: adminKeys.esAdmin(),
    enabled: !!session,
    staleTime: 1000 * 60 * 5,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) {
        // PGRST202 = la función no existe todavía. Pasa en la ventana entre
        // desplegar el frontend y aplicar la migración: eso es "no eres
        // admin", no un error rojo en la consola de todo el mundo.
        if (error.code === 'PGRST202') return false
        throw error
      }
      return data === true
    },
  })
}

export function useAdminMetrics(dias = 30) {
  return useQuery({
    queryKey: adminKeys.metricas(dias),
    queryFn: async (): Promise<AdminMetrics> => {
      const { data, error } = await supabase.rpc('admin_metrics', { p_days: dias })
      if (error) throw error
      return data
    },
  })
}

export function useAdminUsers(q: string, page: number) {
  return useQuery({
    queryKey: adminKeys.usuarios(q, page),
    // Sin esto, al teclear en el buscador la tabla parpadea a esqueleto en
    // cada pulsación. Con datos previos, solo se refresca el contenido.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users', {
        p_q: q || null, p_limit: PAGINA, p_offset: page * PAGINA,
      })
      if (error) throw error
      const filas = (data ?? []) as AdminUserRow[]
      return { filas, total: filas[0]?.total_count ?? 0 }
    },
  })
}

// Una persona concreta con los mismos contadores que la lista. Se pide por
// `p_user` y no buscándola en la lista: si hay más de una página, no está.
export function useAdminUser(userId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.usuario(userId ?? ''),
    enabled: !!userId,
    queryFn: async (): Promise<AdminUserRow | null> => {
      const { data, error } = await supabase.rpc('admin_users', {
        p_user: userId!, p_limit: 1, p_offset: 0,
      })
      if (error) throw error
      return (data as AdminUserRow[])?.[0] ?? null
    },
  })
}

export function useAdminUserTrips(userId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.viajesDe(userId ?? ''),
    enabled: !!userId,
    queryFn: async (): Promise<AdminUserTripRow[]> => {
      const { data, error } = await supabase.rpc('admin_user_trips', { p_user: userId! })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAdminTrips(q: string, page: number) {
  return useQuery({
    queryKey: adminKeys.viajes(q, page),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_trips', {
        p_q: q || null, p_limit: PAGINA, p_offset: page * PAGINA,
      })
      if (error) throw error
      const filas = (data ?? []) as AdminTripRow[]
      return { filas, total: filas[0]?.total_count ?? 0 }
    },
  })
}

export function useAdminTripOverview(tripId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.viaje(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async (): Promise<AdminTripOverview | null> => {
      const { data, error } = await supabase.rpc('admin_trip_overview', { p_trip: tripId! })
      if (error) throw error
      return data
    },
  })
}

export function useAdminTripItinerary(tripId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.itinerario(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async (): Promise<AdminItineraryRow[]> => {
      const { data, error } = await supabase.rpc('admin_trip_itinerary', { p_trip: tripId! })
      if (error) throw error
      return data ?? []
    },
  })
}

// Las visitas NO salen de Supabase: salen de una edge function de Netlify que
// agrega en el servidor. Bajar 50.000 filas al navegador sería ~5 MB de datos
// de otras personas, y este proyecto persiste la caché en localStorage.
export function useAdminAnalytics(dias: number) {
  const { session } = useAuthStore()
  return useQuery({
    queryKey: adminKeys.visitas(dias),
    enabled: !!session,
    staleTime: 1000 * 60,
    retry: false,
    queryFn: async (): Promise<Resumen> => {
      const res = await fetch(`/api/admin/analytics?dias=${dias}`, {
        headers: { Authorization: `Bearer ${session!.access_token}` },
        cache: 'no-store',
      })
      // Si la edge function no está desplegada, el redirect SPA devuelve
      // index.html con 200: sin esta comprobación, el JSON.parse fallaría con
      // un error incomprensible en vez de decir lo que pasa.
      const tipo = res.headers.get('content-type') ?? ''
      if (!tipo.includes('application/json')) {
        throw new Error('ENDPOINT_NO_DESPLEGADO')
      }
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      return body as Resumen
    },
  })
}

// La fecha de la última visita, DIRECTA DE SUPABASE y no del agregado.
//
// Parece redundante con `ultimaVista` del resumen, y no lo es: el resumen sale
// de la edge function de Netlify, así que si esa función está caída o sin
// desplegar no hay resumen — y ese es justo el momento en que hace falta saber
// que no se está grabando nada. Esta consulta va por otro camino y sigue
// respondiendo.
export function useUltimaVista() {
  return useQuery({
    queryKey: adminKeys.ultimaVista(),
    staleTime: 1000 * 60,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('admin_last_view')
      if (error) throw error
      return data
    },
  })
}

export interface SetLimitsArgs {
  p_user: string
  p_can_create_trips?: boolean
  p_max_trips?: number | null
  p_clear_max_trips?: boolean
  p_can_use_ai?: boolean
  p_can_share_trips?: boolean
  p_is_suspended?: boolean
  p_notes?: string | null
}

export function useSetLimits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: SetLimitsArgs) => {
      const { data, error } = await supabase.rpc('admin_set_limits', args)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // La ficha, la lista y la auditoría cambian las tres a la vez: se
      // invalida todo el árbol 'admin' en vez de enumerar claves y acabar
      // olvidándose de una.
      qc.invalidateQueries({ queryKey: adminKeys.all })
      toast.success('Permisos guardados')
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      toast.error(msg || 'No se pudieron guardar los permisos')
    },
  })
}

export interface AuditEntry {
  id: string
  admin_email: string | null
  action: string
  target_user: string | null
  target_email: string | null
  target_trip: string | null
  detail: Record<string, unknown>
  at: string
  total_count: number
}

export const AUDIT_PAGE = 50

export function useAdminAudit(page = 0) {
  return useQuery({
    queryKey: adminKeys.auditoria(page),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_audit_list', {
        p_limit: AUDIT_PAGE,
        p_offset: page * AUDIT_PAGE,
      })
      if (error) throw error
      const filas = (data ?? []) as AuditEntry[]
      // El total viaja repetido en cada fila (count(*) over ()), así que sin
      // filas no hay total: cero.
      return { filas, total: filas[0]?.total_count ?? 0 }
    },
  })
}

export function useAdminEvents(dias = 30) {
  return useQuery({
    queryKey: adminKeys.eventos(dias),
    queryFn: async (): Promise<AdminEvents> => {
      const { data, error } = await supabase.rpc('admin_events', { p_days: dias })
      if (error) throw error
      return data
    },
  })
}

// Solo se pide cuando el diálogo está abierto: es una consulta cara (recorre
// storage.objects) y no tiene sentido tenerla cargada de fondo.
export function useDeleteUserPreview(userId: string, abierto: boolean) {
  return useQuery({
    queryKey: adminKeys.previoBorrado(userId),
    enabled: abierto && !!userId,
    staleTime: 0,
    queryFn: async (): Promise<DeleteUserPreviewRow> => {
      const { data, error } = await supabase.rpc('admin_delete_user_preview', { p_user: userId })
      if (error) throw error
      return data
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (args: { userId: string; confirmEmail: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: args })
      if (error) {
        // Con un status no-2xx, supabase-js deja `data` a null y solo da un
        // "non-2xx status code" genérico: el motivo real está en el cuerpo.
        const res = (error as { context?: Response }).context
        const body = res ? await res.json().catch(() => null) : null
        throw new Error(body?.error ?? error.message ?? 'No se pudo borrar la cuenta')
      }
      if (data?.error) throw new Error(data.error)
      return data as { ok: true; ficheros: number; bytes: number }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: adminKeys.all })
      toast.success(`Cuenta borrada · ${d.ficheros} ficheros eliminados`)
      navigate('/admin/usuarios')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar la cuenta')
    },
  })
}
