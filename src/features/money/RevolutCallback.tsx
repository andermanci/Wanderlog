import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spinner } from '@/design'

/**
 * Vuelta del consentimiento de Revolut. Pantalla completa, sin armazón: solo
 * redirige a Gastos y, si todo fue bien, abre allí la lista de movimientos.
 */
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
    const suffix = gcError ? '' : '?import=revolut'
    navigate(`/trips/${tripId}/expenses${suffix}`, { replace: true })
  }, [tripId, gcError, navigate])

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="size-10" label="Conectando con Revolut" />
        <p className="title-section">Conectando con Revolut…</p>
        <p className="text-[0.9375rem] text-muted-foreground">Enseguida vuelves a tus gastos.</p>
      </div>
    </div>
  )
}
