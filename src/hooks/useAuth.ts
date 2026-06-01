import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { tripKeys } from '@/lib/queries/trips'
import { reminderKeys } from '@/lib/queries/reminders'

export function useAuthListener() {
  const { setSession, setProfile, setLoading } = useAuthStore()
  const qc = useQueryClient()
  // Evita cargar el perfil varias veces en paralelo (getSession + eventos de auth).
  const profileFetchedFor = useRef<string | null>(null)

  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 10000)

    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) console.error('[useAuth] getSession error:', error)

        // Si el token de acceso está caducado o a punto de caducar, lo
        // refrescamos antes de seguir, para no enviar peticiones anónimas.
        if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
          const { data: refreshed, error: refErr } = await supabase.auth.refreshSession()
          if (refErr || !refreshed.session) {
            console.error('[useAuth] no se pudo refrescar; cerrando sesión:', refErr)
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
            clearTimeout(fallback)
            setSession(null)
            setProfile(null)
            qc.clear()
            setLoading(false)
            return
          }
          session = refreshed.session
        }

        clearTimeout(fallback)
        setSession(session)
        if (session?.user) {
          fetchProfile(session.user)
          prefetchDashboard(session.user.id)
        }
        setLoading(false)
      })
      .catch((err) => {
        clearTimeout(fallback)
        console.error('[useAuth] getSession threw:', err)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // getSession() ya gestiona la sesión inicial; ignoramos su evento duplicado.
      if (event === 'INITIAL_SESSION') return
      setSession(session)
      if (event === 'SIGNED_OUT' || !session?.user) {
        profileFetchedFor.current = null
        setProfile(null)
        qc.clear()
      } else if (event === 'SIGNED_IN') {
        fetchProfile(session.user)
      }
      // TOKEN_REFRESHED / USER_UPDATED: solo actualizamos la sesión.
    })

    return () => { clearTimeout(fallback); subscription.unsubscribe() }
  }, [setSession, setProfile, setLoading, qc])

  async function fetchProfile(user: { id: string; email?: string; user_metadata?: Record<string, string> }) {
    // No repetir si ya cargamos (o estamos cargando) el perfil de este usuario.
    if (profileFetchedFor.current === user.id) return
    profileFetchedFor.current = user.id
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      }, { onConflict: 'id' })

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data)
    } catch (e) {
      profileFetchedFor.current = null // permitir reintento si falló
      console.error('[useAuth] fetchProfile error:', e)
    }
  }

  function prefetchDashboard(userId: string) {
    qc.prefetchQuery({
      queryKey: tripKeys.lists(),
      staleTime: 1000 * 60 * 5,
      queryFn: async () => {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .order('start_date', { ascending: true })
        if (error) throw error
        return data
      },
    })

    qc.prefetchQuery({
      queryKey: reminderKeys.pending(),
      staleTime: 1000 * 60 * 5,
      queryFn: async () => {
        const { data, error } = await supabase
          .from('reminders')
          .select('*, trips(name, destination)')
          .eq('user_id', userId)
          .eq('is_sent', false)
          .gte('remind_at', new Date().toISOString())
          .order('remind_at')
          .limit(10)
        if (error) throw error
        return data
      },
    })
  }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export function useSignOut() {
  const { setSession, setProfile } = useAuthStore()
  const qc = useQueryClient()
  const navigate = useNavigate()

  return async function signOut() {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    setSession(null)
    setProfile(null)
    qc.clear()
    navigate('/login')
  }
}
