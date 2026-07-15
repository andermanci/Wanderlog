import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Outlet, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { OfflineBanner } from '@/components/OfflineBanner'
import { TripSearchCommand } from '@/components/trips/TripSearchCommand'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWalletPassStore } from '@/store/walletPassStore'

// El modal "cartera" arrastra zxing + pdf.js (~880 KB): carga diferida, y solo
// tras la primera apertura, para no engordar el bundle principal.
const WalletPassModal = lazy(() => import('@/components/wallet/WalletPassModal'))

export function AppLayout() {
  const { tripId: pathTripId } = useParams<{ tripId: string }>()
  const [searchParams] = useSearchParams()
  // Rutas fuera de /trips/:tripId (p. ej. /import/shared?trip=…) igualan el
  // contexto del viaje por query, para conservar el sidebar y la barra del viaje.
  const tripId = pathTripId ?? searchParams.get('trip') ?? undefined
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  const passOpen = useWalletPassStore(s => s.open)
  const [mountPassModal, setMountPassModal] = useState(false)
  useEffect(() => { if (passOpen) setMountPassModal(true) }, [passOpen])

  // El contenedor de scroll conserva la posición entre rutas: al navegar
  // (p. ej. dashboard scrolleado → viaje) la página nueva aparecía ya
  // desplazada, con los breadcrumbs fuera de vista. Reset al cambiar de ruta.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  // El mapa es a pantalla completa: solo necesita el alto de la barra (sin la
  // holgura extra de las páginas de contenido, que dejaría una franja de fondo).
  const onMap = location.pathname.endsWith('/map')

  return (
    <TooltipProvider>
      {/* Saltar al contenido: primer elemento tabulable, visible solo al enfocar */}
      <a href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-card focus:border focus:border-border focus:shadow-lg text-sm font-medium">
        Saltar al contenido
      </a>
      {/* pt de safe-area: en PWA standalone el contenido se extiende tras la
          barra de estado del móvil (notch); así nada queda tapado por ella */}
      <div
        className="flex flex-col h-dvh overflow-hidden bg-background"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <OfflineBanner />
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar solo en escritorio */}
          <div className="hidden md:flex h-full">
            <Sidebar tripId={tripId} />
          </div>
          {/* pb extra en móvil: altura de la barra inferior + safe-area + holgura,
              para que el último elemento no quede pegado/oculto tras el footer. */}
          <main
            id="contenido"
            ref={mainRef}
            tabIndex={-1}
            className={`flex-1 overflow-auto outline-none md:pb-0 ${onMap ? 'pb-[calc(env(safe-area-inset-bottom)+3.5rem)]' : 'pb-[calc(env(safe-area-inset-bottom)+4.5rem)]'}`}
          >
            <Outlet />
          </main>
        </div>
        {/* Navegación inferior solo en móvil */}
        <BottomNav tripId={tripId} />
        {/* Búsqueda del viaje (Cmd+K); solo dentro de un viaje */}
        {tripId && <TripSearchCommand tripId={tripId} />}
        {/* Modal "cartera" (QR/código de reservas), abrible desde cualquier pantalla */}
        {mountPassModal && (
          <Suspense fallback={null}>
            <WalletPassModal />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  )
}
