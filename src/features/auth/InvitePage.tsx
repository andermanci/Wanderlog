import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, MapPin, MailX, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Empty, Spinner } from '@/design'
import { useInvitePreview, useAcceptInvite, ROLE_LABELS } from '@/lib/queries/sharing'
import { useEmailLink } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import { clearPendingInvite, rememberPendingInvite } from '@/lib/pendingInvite'
import { Acceso, Marca, PantallaAcceso } from './piezas'

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
  // El botón «Unirme al viaje» abre las formas de entrar en la misma tarjeta.
  const [uniendose, setUniendose] = useState(false)

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

  // Con sesión se está aceptando en segundo plano y navegando fuera: se deja
  // el indicador en vez de enseñar un acceso que nadie va a usar. Salvo que el
  // token no valga nada, que entonces hay que contarlo.
  const busy =
    loading || isLoading || (!!session && !isError && invite?.status !== 'invalid')

  return (
    <PantallaAcceso>
      <div className="animate-rise">
        <p className="mb-6 text-center"><Marca className="text-2xl" /></p>

        {busy ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Spinner className="size-8" />
            <p className="text-[0.9375rem] text-muted-foreground">
              {session ? 'Entrando al viaje…' : 'Cargando la invitación…'}
            </p>
          </div>
        ) : isError || !invite || invite.status === 'invalid' ? (
          <Problema
            titulo="Esta invitación no es válida"
            texto="Puede que el enlace esté incompleto o que te hayan quitado el acceso. Pide a quien te invitó que te la envíe otra vez."
          />
        ) : invite.status === 'expired' ? (
          <Problema
            titulo="La invitación ha caducado"
            texto={`Los enlaces caducan a los 30 días. Pide a ${invite.inviter_name ?? 'quien te invitó'} que te la envíe otra vez.`}
          />
        ) : invite.status === 'accepted' ? (
          <Problema
            titulo="Esta invitación ya se ha usado"
            texto="Si fuiste tú, entra con tu cuenta y verás el viaje en tu lista."
          />
        ) : (
          <Card pad="none" className="overflow-hidden shadow-raised">
            {invite.cover_image_url && (
              <img src={invite.cover_image_url} alt="" className="h-40 w-full object-cover" />
            )}
            <div className="p-6 md:p-7">
              <p className="eyebrow">
                {invite.inviter_name ?? 'Alguien'} te invita a un viaje
              </p>
              <h1 className="title-page mt-1.5">{invite.trip_name}</h1>
              <ul className="mt-3 space-y-1.5 text-[0.9375rem] text-muted-foreground">
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">Destino:</span>
                  {invite.destination}
                </li>
                {invite.start_date && invite.end_date && (
                  <li className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Fechas:</span>
                    Del {formatDate(invite.start_date)} al {formatDate(invite.end_date)}
                  </li>
                )}
              </ul>
              {invite.role && (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  Vas a poder: <Badge tone="primary">{ROLE_LABELS[invite.role]}</Badge>
                </p>
              )}

              <div className="mt-6 border-t border-border pt-6">
                {uniendose ? (
                  <>
                    {!emailLink.sent && (
                      <p className="mb-4 text-[0.9375rem] text-muted-foreground">
                        Entra o crea tu cuenta para unirte. Es gratis y no hay contraseñas.
                      </p>
                    )}
                    {/* Unirse con otra cuenta distinta a la invitada funciona: el
                        token es lo que da el acceso, no el correo. */}
                    <Acceso
                      link={emailLink}
                      email={email}
                      onEmailChange={setTypedEmail}
                      onBeforeGoogle={rememberInvite}
                      notaEnviado="Ábrelo en este dispositivo y entrarás directo al viaje."
                      pie={invite.invited_email
                        ? `Puedes entrar con la cuenta que prefieras, aunque no sea ${invite.invited_email}.`
                        : 'Puedes entrar con la cuenta que prefieras.'}
                    />
                  </>
                ) : (
                  <Button variant="primary" size="lg" block onClick={() => setUniendose(true)}>
                    <UserPlus aria-hidden="true" />
                    Unirme al viaje
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </PantallaAcceso>
  )
}

function Problema({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Empty icon={MailX} title={titulo} description={texto}>
      <Button asChild variant="primary">
        <Link to="/login">Ir a Wanderlog</Link>
      </Button>
    </Empty>
  )
}
