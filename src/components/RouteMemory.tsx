import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { guardarRuta, rutaAlArrancar, tocarRuta } from '@/lib/resumeState'

/**
 * A dónde va `/`. Al dashboard, salvo que hubiera una pantalla reciente donde
 * te quedaste: entonces, allí.
 *
 * La decisión vive AQUÍ, en el elemento de la ruta índice, y no en un efecto
 * suelto que navegue: un `navigate()` desde un efecto de montaje compite con el
 * `<Navigate>` de esta misma ruta en el mismo commit, y gana el segundo — la
 * pantalla recuperada ni se llegaba a pintar. Decidiéndolo en el propio destino
 * no hay carrera que perder.
 *
 * Solo aplica a `/`. Si llegas por un enlace (compartir, invitación, callback) o
 * abres cualquier otra URL, mandas tú: esto ni se monta.
 */
export function StartRoute() {
  // Una sola vez: si más tarde vuelves a `/` a mano dentro de la misma sesión,
  // que no te mande a un sitio distinto cada vez.
  const [destino] = useState(() => rutaAlArrancar() ?? '/dashboard')
  return <Navigate to={destino} replace />
}

/**
 * Apunta por dónde ibas para que <StartRoute> pueda devolverte ahí. Va dentro
 * del router (necesita useLocation) y no pinta nada, igual que <Analytics/>.
 *
 * El porqué está en resumeState.ts: iOS no reanuda la PWA, la arranca de cero.
 */
export function RouteMemory() {
  const location = useLocation()

  useEffect(() => {
    guardarRuta(location.pathname + location.search)
  }, [location.pathname, location.search])

  // Marcar la hora justo al irse a segundo plano, que es cuando iOS puede matar
  // la app: así la media hora de caducidad cuenta desde que saliste y no desde
  // que navegaste. `pagehide` además del cambio de visibilidad porque en iOS
  // Safari es el único que llega fiablemente (mismo criterio que Analytics.tsx).
  useEffect(() => {
    const alOcultar = () => { if (document.visibilityState === 'hidden') tocarRuta() }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', tocarRuta)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', tocarRuta)
    }
  }, [])

  return null
}
