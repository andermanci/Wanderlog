import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEmailLink } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { Acceso, PantallaAcceso } from './piezas'

/** Pantalla de acceso: una foto de viaje con la marca y, al lado, dos formas claras de entrar. */
export function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuthStore()

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  const [email, setEmail] = useState('')
  const emailLink = useEmailLink()

  return (
    <PantallaAcceso
      titular={
        <p className="max-w-md font-serif text-3xl font-medium leading-[1.08] tracking-tight md:text-5xl">
          Tus viajes, bien planeados y siempre a mano.
        </p>
      }
    >
      {!emailLink.sent && (
        <header className="mb-7">
          <p className="eyebrow">Te damos la bienvenida</p>
          <h1 className="title-hero mt-1.5">Entra en Wanderlog</h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
            El plan, los billetes y los gastos de cada viaje, en un solo sitio.
          </p>
        </header>
      )}

      <Acceso
        link={emailLink}
        email={email}
        onEmailChange={setEmail}
        notaEnviado="Ábrelo en este dispositivo para entrar."
        pie="Sin contraseñas. Si aún no tienes cuenta, se crea al entrar."
      />

      <p className="mt-8 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
        Tus viajes son privados: solo los ves tú y quien tú invites.{' '}
        <Link to="/privacidad" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Qué se guarda de ti
        </Link>
      </p>
    </PantallaAcceso>
  )
}
