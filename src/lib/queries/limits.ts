import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LIMITES_POR_DEFECTO, type UserLimits } from '@/lib/limits'

export const limitKeys = {
  mine: () => ['limits', 'mine'] as const,
}

// Los permisos de la cuenta propia. La política `user_limits_select_own`
// permite justo esta lectura y ninguna otra.
//
// Nunca falla hacia "bloqueado": si la tabla todavía no existe (la migración
// no se ha aplicado), si no hay fila, o si la consulta se cae, se devuelven
// los permisos por defecto, que lo permiten todo. Lo contrario dejaría a
// medio mundo sin poder crear viajes por un error de red.
export function useMyLimits() {
  const { session } = useAuthStore()
  return useQuery({
    queryKey: limitKeys.mine(),
    enabled: !!session,
    staleTime: 1000 * 60 * 5,
    retry: false,
    queryFn: async (): Promise<UserLimits> => {
      const { data, error } = await supabase
        .from('user_limits')
        .select('can_create_trips, max_trips, can_use_ai, can_share_trips, is_suspended, notes')
        .eq('user_id', session!.user.id)
        .maybeSingle()
      // 42P01 = la tabla no existe (ventana entre desplegar y migrar).
      if (error && error.code !== '42P01') throw error
      return (data as UserLimits | null) ?? LIMITES_POR_DEFECTO
    },
  })
}
