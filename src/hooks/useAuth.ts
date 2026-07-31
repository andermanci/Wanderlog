import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { tripKeys } from '@/lib/queries/trips'
import { reminderKeys } from '@/lib/queries/reminders'
import { clearDocCache } from '@/lib/docCache'

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

// Acceso por email sin contraseña: enviamos un "enlace mágico". Al pulsarlo en
// el correo, el usuario entra. Alternativa inclusiva para quien no usa Google.
export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

// Supabase exige un minuto entre dos enlaces al mismo correo (y limita el total
// por hora del proyecto). Al pasarse responde 429 y antes lo tratábamos como un
// error cualquiera: quien pulsaba dos veces leía "revisa el email" y se creía
// que lo había escrito mal.
const EMAIL_COOLDOWN_SECONDS = 60

function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { status, code } = err as { status?: number; code?: string }
  return status === 429 || code === 'over_email_send_rate_limit'
}

// El formulario de enlace mágico es idéntico en el login y en la invitación,
// así que vive aquí: mismo estado, mismos mensajes y la misma cuenta atrás.
//
// El correo trae enlace y código, y hacen falta los dos. En iOS, una web
// añadida a la pantalla de inicio corre aislada de Safari: el enlace abre
// Safari, la sesión se crea ahí y la "app" se queda fuera. Tecleando el código
// dentro de la app, la sesión se guarda donde toca.
export function useEmailLink(onBeforeSend?: () => void) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function send(email: string) {
    const trimmed = email.trim()
    if (!trimmed || sending || cooldown > 0) return
    onBeforeSend?.()
    setSending(true)
    try {
      await signInWithEmail(trimmed)
      setSent(true)
      setCooldown(EMAIL_COOLDOWN_SECONDS)
    } catch (err) {
      if (isRateLimited(err)) {
        // El servidor ya no acepta otro envío: la cuenta atrás evita que siga
        // insistiendo contra una puerta cerrada.
        setCooldown(EMAIL_COOLDOWN_SECONDS)
        toast.error('Has pedido varios enlaces seguidos. Espera un minuto e inténtalo otra vez.')
      } else {
        toast.error('No se pudo enviar el enlace. Revisa el email e inténtalo de nuevo.')
      }
    } finally {
      setSending(false)
    }
  }

  // Al validar el código, supabase-js guarda la sesión y dispara el evento de
  // auth: quien esté escuchando (useAuthListener) se encarga de redirigir, así
  // que aquí no se navega a ningún sitio.
  async function verify(email: string) {
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6 || verifying) return
    setVerifying(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: digits,
        type: 'email',
      })
      if (error) throw error
    } catch {
      toast.error('El código no vale o ha caducado. Pide otro y vuelve a intentarlo.')
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  function changeEmail() {
    setSent(false)
    setCode('')
  }

  return { send, sending, sent, cooldown, changeEmail, code, setCode, verify, verifying }
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
    // Los documentos descargados para verlos sin conexión (DNIs, pasaportes) no
    // pueden quedarse en el dispositivo después de cerrar sesión.
    clearDocCache().catch(() => {})
    navigate('/login')
  }
}
