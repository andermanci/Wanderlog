import { MailCheck, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { useEmailLink } from '@/hooks/useAuth'

type EmailLink = ReturnType<typeof useEmailLink>

// Lo que se ve después de pedir el enlace, igual en el login y en la
// invitación. Ofrece las dos vías a propósito: el enlace es lo cómodo en
// ordenador, y el código es la única que funciona en un iPhone con la app en
// la pantalla de inicio, porque ahí el enlace se abre en Safari y la sesión se
// queda en Safari.
export function EmailSentPanel({
  link,
  email,
  note,
}: {
  link: EmailLink
  email: string
  note: string
}) {
  const { code, setCode, verify, verifying, send, sending, cooldown, changeEmail } = link
  const complete = code.length === 6

  return (
    <div
      className="w-full text-center flex flex-col items-center gap-3 p-4 rounded-xl"
      style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
    >
      <MailCheck size={28} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      <p className="font-medium">Revisa tu correo</p>
      <p className="text-sm text-muted-foreground">
        Te hemos escrito a <strong>{email}</strong>. {note}
      </p>

      <div className="w-full flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o usa el código</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          verify(email)
        }}
        className="w-full flex flex-col gap-2"
      >
        <label htmlFor="otp-code" className="text-xs text-muted-foreground">
          En el correo hay un código de 6 dígitos. Si abriste Wanderlog desde la pantalla
          de inicio, entra por aquí: el enlace te llevaría a Safari.
        </label>
        <Input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          aria-label="Código de 6 dígitos"
          className="h-12 text-center text-xl tracking-[0.4em] font-mono"
        />
        <Button type="submit" variant="brand" className="w-full h-12 gap-2" disabled={!complete || verifying}>
          {verifying ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogIn size={16} aria-hidden="true" />
          )}
          Entrar con el código
        </Button>
      </form>

      <div className="flex items-center gap-4 pt-1">
        <button onClick={changeEmail} className="text-sm text-primary hover:underline">
          Usar otro email
        </button>
        <button
          onClick={() => send(email)}
          disabled={sending || cooldown > 0}
          className="text-sm text-primary hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar'}
        </button>
      </div>
    </div>
  )
}
