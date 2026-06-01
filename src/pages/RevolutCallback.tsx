import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export function RevolutCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tripId = params.get('trip')
  const gcError = params.get('error')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    if (!tripId) {
      navigate('/dashboard', { replace: true })
      return
    }
    // Volvemos a Gastos y abrimos el selector de movimientos (?import=revolut).
    const suffix = gcError ? '' : '?import=revolut'
    navigate(`/trips/${tripId}/expenses${suffix}`, { replace: true })
  }, [tripId, gcError, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary)' }} />
        <p className="text-muted-foreground">Conectando con Revolut…</p>
      </div>
    </div>
  )
}
