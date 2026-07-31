import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Compass, Mail, MapPin, Calendar, Loader2, Frown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmailSentPanel } from '@/components/auth/EmailSentPanel'
import { useInvitePreview, useAcceptInvite, ROLE_LABELS } from '@/lib/queries/sharing'
import { signInWithGoogle, useEmailLink } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import { clearPendingInvite, rememberPendingInvite } from '@/lib/pendingInvite'
import { toast } from 'sonner'

// Pantalla pública de una invitación a un viaje. Es la única ruta que enseña
// algo (nombre, destino y fechas del viaje) sin sesión: es lo que hace que
// alguien sin cuenta se anime a crearla.
export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, loading } = useAuthStore()
  const { data: invite, isLoading, isError } = useInvitePreview(token)
  const accept = useAcceptInvite()
  const accepted = useRef(false)

  const [typedEmail, setTypedEmail] = useState<string | null>(null)

  // El correo al que se invitó va prerrellenado (casi siempre es el que esa
  // persona quiere usar) hasta que escriba otro.
  const email = typedEmail ?? invite?.invited_email ?? ''

  // Con sesión, no hay nada que preguntar: se acepta y se entra al viaje.
  useEffect(() => {
    if (!token || !session || !invite || accepted.current) return
    if (invite.status === 'invalid') return
    accepted.current = true
    accept.mutate(token, {
      onSuccess: (tripId) => {
        clearPendingInvite()
        toast.success(`Ya estás en ${invite.trip_name ?? 'el viaje'}`)
        navigate(`/trips/${tripId}`, { replace: true })
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo aceptar la invitación')
        navigate('/dashboard', { replace: true })
      },
    })
  }, [token, session, invite, accept, navigate])

  function rememberInvite() {
    if (token) rememberPendingInvite(token)
  }

  // Se apunta la invitación antes de salir a por el enlace: al volver desde el
  // correo hay que saber a qué viaje se estaba entrando.
  const emailLink = useEmailLink(rememberInvite)
  const { send, sending, sent, cooldown } = emailLink

  async function handleGoogle() {
    rememberInvite()
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Error al iniciar sesión con Google')
    }
  }

  function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    send(email)
  }

  // Con sesión se está aceptando en segundo plano y navegando fuera: se deja
  // el spinner en vez de enseñar un login que nadie va a usar. Salvo que el
  // token no valga nada, que entonces hay que contarlo.
  const busy =
    loading || isLoading || (!!session && !isError && invite?.status !== 'invalid')

  return (
    <div className="min-h-dvh flex relative overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Mismo fondo editorial que el login: se tiene que notar que es la misma app */}
      <div
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
      />
      <div
        className="absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--chart-4) 16%, transparent)' }}
      />
      <div className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, var(--primary) 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, var(--primary) 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="glass rounded-2xl p-8 w-full max-w-md flex flex-col items-center gap-6"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5" style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <span className="text-sm uppercase tracking-widest text-muted-foreground">Wanderlog</span>
          </div>

          {busy ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)' }} aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {session ? 'Entrando al viaje…' : 'Cargando la invitación…'}
              </p>
            </div>
          ) : isError || !invite || invite.status === 'invalid' ? (
            <InviteProblem
              title="Esta invitación no es válida"
              text="Puede que el enlace esté incompleto o que se haya retirado el acceso. Pídele a quien te invitó que te la mande otra vez."
            />
          ) : invite.status === 'expired' ? (
            <InviteProblem
              title="La invitación ha caducado"
              text={`Los enlaces caducan a los 30 días. Pídele a ${invite.inviter_name ?? 'quien te invitó'} que te reenvíe la invitación.`}
            />
          ) : invite.status === 'accepted' ? (
            <InviteProblem
              title="Esta invitación ya se ha usado"
              text="Si eras tú, entra con tu cuenta y verás el viaje en tu lista."
            />
          ) : (
            <>
              <div className="text-center flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">
                  <strong style={{ color: 'var(--foreground)' }}>{invite.inviter_name ?? 'Alguien'}</strong> te invita a un viaje
                </p>
              </div>

              {/* Ficha del viaje */}
              <div className="w-full rounded-xl overflow-hidden" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
                {invite.cover_image_url && (
                  <img
                    src={invite.cover_image_url}
                    alt=""
                    className="w-full h-32 object-cover"
                  />
                )}
                <div className="p-4 flex flex-col gap-2">
                  <h1 className="text-xl font-semibold leading-tight">{invite.trip_name}</h1>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin size={14} aria-hidden="true" /> {invite.destination}
                  </p>
                  {invite.start_date && invite.end_date && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar size={14} aria-hidden="true" />
                      {formatDate(invite.start_date)} – {formatDate(invite.end_date)}
                    </p>
                  )}
                  {invite.role && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Permiso: {ROLE_LABELS[invite.role]}
                    </p>
                  )}
                </div>
              </div>

              {sent ? (
                <EmailSentPanel
                  link={emailLink}
                  email={email}
                  note="Ábrelo en este dispositivo y entrarás directo al viaje."
                />
              ) : (
                <div className="w-full flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Entra o crea tu cuenta para unirte. Es gratis y sin contraseñas.
                  </p>

                  <Button
                    onClick={handleGoogle}
                    variant="brand"
                    className="w-full h-12 text-base font-medium gap-3 transition-all hover:scale-[1.02]"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff" opacity=".8"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff" opacity=".8"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#ffffff" opacity=".8"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ffffff" opacity=".8"/>
                    </svg>
                    Continuar con Google
                  </Button>

                  <div className="w-full flex items-center gap-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">o con tu email</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <form onSubmit={handleEmail} className="w-full flex flex-col gap-2">
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setTypedEmail(e.target.value)}
                        placeholder="tu@email.com"
                        aria-label="Correo electrónico"
                        className="pl-9 h-12"
                      />
                    </div>
                    <Button type="submit" variant="outline" className="w-full h-12 gap-2" disabled={sending || cooldown > 0}>
                      {sending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
                      {cooldown > 0 ? `Espera ${cooldown}s para pedir otro` : 'Enviarme un enlace de acceso'}
                    </Button>
                  </form>

                  {/* Unirse con otra cuenta distinta a la invitada funciona: el
                      token es lo que da el acceso, no el correo. */}
                  <p className="text-xs text-muted-foreground text-center">
                    Puedes entrar con la cuenta que prefieras, aunque no sea{' '}
                    {invite.invited_email}.
                  </p>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function InviteProblem({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-6">
      <Frown size={32} className="text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link to="/login" className="text-sm text-primary hover:underline mt-2">
        Ir a Wanderlog
      </Link>
    </div>
  )
}
