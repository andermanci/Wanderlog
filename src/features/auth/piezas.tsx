import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, LogIn, Mail, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Field, Input } from '@/design'
import { OTP_MIN_LENGTH, OTP_MAX_LENGTH, signInWithGoogle, type useEmailLink } from '@/hooks/useAuth'
import { FALLBACK_COVERS } from '@/lib/coverFallbacks'
import { cn } from '@/lib/utils'

type EmailLink = ReturnType<typeof useEmailLink>

/** La marca, igual en todas las pantallas de acceso. `lisa`: de un solo color (sobre una foto). */
export function Marca({ className, lisa }: { className?: string; lisa?: boolean }) {
  return (
    <span className={cn('font-serif font-medium tracking-tight', className)}>
      Wander<span className={lisa ? 'opacity-75' : 'text-primary'}>log</span>
    </span>
  )
}

interface PantallaAccesoProps {
  /** La foto a sangre. Por defecto, una de las portadas empaquetadas. */
  foto?: string
  /** Lo que se lee encima de la foto, abajo: la frase o el viaje al que te invitan. */
  titular?: ReactNode
  /** La foto ocupa algo más en el móvil (cuando el titular trae varias líneas). */
  alta?: boolean
  children: ReactNode
}

/**
 * Pantalla completa de las rutas sin armazón (acceso, invitación).
 * Escritorio: dos mitades, la foto a la izquierda y el acceso a la derecha.
 * Móvil: la foto arriba y el acceso en una hoja redondeada que monta sobre ella.
 */
export function PantallaAcceso({ foto = FALLBACK_COVERS[0], titular, alta, children }: PantallaAccesoProps) {
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-2">
      <div className={cn(
        'relative overflow-hidden bg-secondary text-white md:sticky md:top-0 md:h-dvh',
        alta ? 'h-[44dvh] min-h-72' : 'h-[36dvh] min-h-60',
      )}>
        <img src={foto} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="photo-scrim absolute inset-0" />
        <div className="absolute inset-0 pt-safe">
          <div className="flex h-full flex-col justify-between px-5 pb-12 pt-5 md:p-10 lg:p-14">
            <p><Marca lisa className="text-2xl md:text-3xl" /></p>
            {titular && <div className="min-w-0 animate-rise">{titular}</div>}
          </div>
        </div>
      </div>
      <main className="relative z-10 -mt-7 rounded-t-3xl bg-background px-5 pb-10 pt-8 md:mt-0 md:flex md:min-h-dvh md:items-center md:rounded-none md:px-10 md:py-12">
        <div className="mx-auto w-full max-w-md pb-safe animate-rise">
          {children}
        </div>
      </main>
    </div>
  )
}

/** El logotipo de Google con sus colores oficiales (única excepción a «solo tokens»). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

interface AccesoProps {
  /** Estado del acceso por correo (`useEmailLink`), que vive en la pantalla. */
  link: EmailLink
  email: string
  onEmailChange: (email: string) => void
  /** Se llama justo antes de salir hacia Google (p. ej. para apuntar la invitación). */
  onBeforeGoogle?: () => void
  /** Frase bajo «Revisa tu correo»: qué pasa al abrir el enlace. */
  notaEnviado: string
  /** Texto pequeño bajo las dos opciones. */
  pie?: ReactNode
}

/**
 * Las dos formas de entrar, iguales en el acceso y en la invitación:
 * Google, o el correo (enlace + código). Tres pasos en el mismo hueco:
 * elegir → escribir el correo → «te hemos enviado un correo».
 */
export function Acceso({ link, email, onEmailChange, onBeforeGoogle, notaEnviado, pie }: AccesoProps) {
  const [conCorreo, setConCorreo] = useState(false)
  const { send, sending, sent, cooldown } = link

  async function entrarConGoogle() {
    onBeforeGoogle?.()
    try {
      await signInWithGoogle()
    } catch {
      toast.error('No se pudo entrar con Google. Inténtalo otra vez.')
    }
  }

  function pedirCorreo(e: FormEvent) {
    e.preventDefault()
    send(email)
  }

  if (sent) return <CorreoEnviado link={link} email={email} nota={notaEnviado} />

  if (conCorreo) {
    return (
      <form onSubmit={pedirCorreo} className="space-y-4">
        <Field
          label="Tu correo"
          hint="Te enviamos un enlace y un código para entrar. No hay contraseñas."
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="tu@correo.com"
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" block className="h-14" loading={sending} disabled={cooldown > 0}>
          {!sending && <Mail aria-hidden="true" />}
          {cooldown > 0 ? `Espera ${cooldown} s para pedir otro` : 'Enviarme el correo'}
        </Button>
        <Button variant="ghost" block onClick={() => setConCorreo(false)}>
          <ArrowLeft aria-hidden="true" />
          Entrar de otra forma
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="lg" block className="h-14" onClick={entrarConGoogle}>
        <LogoGoogle />
        Continuar con Google
      </Button>
      <Button variant="secondary" size="lg" block className="h-14" onClick={() => setConCorreo(true)}>
        <Mail aria-hidden="true" />
        Entrar con mi correo
      </Button>
      {pie && <p className="pt-2 text-sm leading-relaxed text-muted-foreground">{pie}</p>}
    </div>
  )
}

// Lo que se ve después de pedir el correo. Ofrece las dos vías a propósito: el
// enlace es lo cómodo en ordenador, y el código es la única que funciona en un
// iPhone con la app en la pantalla de inicio, porque ahí el enlace se abre en
// Safari y la sesión se queda en Safari.
function CorreoEnviado({ link, email, nota }: { link: EmailLink; email: string; nota: string }) {
  const { code, setCode, verify, verifying, send, sending, cooldown, changeEmail } = link
  const completo = code.length >= OTP_MIN_LENGTH

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow flex items-center gap-1.5 text-accent-foreground">
          <MailCheck className="size-4" aria-hidden="true" /> Correo enviado
        </p>
        <h2 className="title-page mt-1.5">Revisa tu correo</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
          Te hemos escrito a <strong className="break-all font-semibold text-foreground">{email}</strong>. Pulsa el enlace que trae. {nota}
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); verify(email) }}
        className="space-y-3 rounded-2xl bg-sunken p-4"
      >
        <Field
          label="O escribe aquí el código del correo"
          hint="Si abriste Wanderlog desde la pantalla de inicio del iPhone, entra con el código: el enlace te llevaría a Safari."
        >
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_MAX_LENGTH}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
            className="h-13 text-center font-mono text-xl tracking-[0.3em]"
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={verifying} disabled={!completo}>
          {!verifying && <LogIn aria-hidden="true" />}
          Entrar con el código
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Button variant="ghost" loading={sending} disabled={cooldown > 0} onClick={() => send(email)}>
          {cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar el correo'}
        </Button>
        <Button variant="ghost" onClick={changeEmail}>
          Usar otro correo
        </Button>
      </div>
    </div>
  )
}
