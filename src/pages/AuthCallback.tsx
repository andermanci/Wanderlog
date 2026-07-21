import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { takePendingInvite } from '@/lib/pendingInvite'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Si se venía de una invitación, se vuelve a ella para aceptarla en
        // vez de soltar a la persona en un dashboard vacío.
        const invite = takePendingInvite()
        navigate(invite ? `/invite/${invite}` : '/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        <span className="text-muted-foreground font-serif text-lg">Autenticando...</span>
      </div>
    </div>
  )
}
