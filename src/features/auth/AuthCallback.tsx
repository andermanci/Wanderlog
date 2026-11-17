import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@/design'
import { supabase } from '@/lib/supabase'
import { takePendingInvite } from '@/lib/pendingInvite'

/** Aterrizaje al volver de Google o del enlace del correo: decide adónde ir. */
export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Si se venía de una invitación, se vuelve a ella para aceptarla en
        // vez de soltar a la persona en una lista de viajes vacía.
        const invite = takePendingInvite()
        navigate(invite ? `/invite/${invite}` : '/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="size-8" label="Entrando" />
        <p className="font-serif text-xl text-muted-foreground">Entrando…</p>
      </div>
    </div>
  )
}
