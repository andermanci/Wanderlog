import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/design'
import { useEmailLink } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { Acceso, Marca, PantallaAcceso } from './piezas'

/** Pantalla de acceso: la marca, una frase y dos formas claras de entrar. */
export function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuthStore()

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  const [email, setEmail] = useState('')
  const emailLink = useEmailLink()

  return (
    <PantallaAcceso>
      <div className="animate-rise">
        <header className="mb-8 text-center">
          <h1><Marca className="title-hero" /></h1>
          <p className="mx-auto mt-3 max-w-xs text-base leading-relaxed text-muted-foreground">
            Tus viajes, bien planeados y siempre a mano.
          </p>
        </header>

        <Card pad="lg" className="shadow-raised">
          <Acceso
            link={emailLink}
            email={email}
            onEmailChange={setEmail}
            notaEnviado="Ábrelo en este dispositivo para entrar."
            pie="Sin contraseñas. Si aún no tienes cuenta, se crea al entrar."
          />
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Tus viajes son privados: solo los ves tú y quien tú invites.{' '}
          <Link to="/privacidad" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
            Qué se guarda de ti
          </Link>
        </p>
      </div>
    </PantallaAcceso>
  )
}
