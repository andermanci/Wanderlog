import { useEffect, useRef } from 'react'
import { Outlet, useParams, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppLayout() {
  const { tripId } = useParams<{ tripId: string }>()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // El contenedor de scroll conserva la posición entre rutas: al navegar
  // (p. ej. dashboard scrolleado → viaje) la página nueva aparecía ya
  // desplazada, con los breadcrumbs fuera de vista. Reset al cambiar de ruta.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <TooltipProvider>
      {/* pt de safe-area: en PWA standalone el contenido se extiende tras la
          barra de estado del móvil (notch); así nada queda tapado por ella */}
      <div
        className="flex h-dvh overflow-hidden bg-background"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Sidebar solo en escritorio */}
        <div className="hidden md:flex h-full">
          <Sidebar tripId={tripId} />
        </div>
        {/* pb extra en móvil: altura de la barra inferior + safe-area + holgura,
            para que el último elemento no quede pegado/oculto tras el footer. */}
        <main ref={mainRef} className="flex-1 overflow-auto pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-0">
          <Outlet />
        </main>
        {/* Navegación inferior solo en móvil */}
        <BottomNav tripId={tripId} />
      </div>
    </TooltipProvider>
  )
}
