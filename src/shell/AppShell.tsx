import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Outlet, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { useWalletPassStore } from '@/store/walletPassStore'
import { guardarScroll, tomarScrollPendiente } from '@/lib/resumeState'
import { cn } from '@/lib/utils'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'
import { QuickAdd } from './QuickAdd'
import { GlobalSearch } from './GlobalSearch'
import { CuentaSuspendidaBanner, OfflineBanner } from './Banners'
import { useUiStore } from './uiStore'
import { MiniPlayer } from '@/features/guide/MiniPlayer'

// Paneles globales: se descargan la primera vez que se abren.
// La cartera arrastra zxing + pdf.js (~880 KB).
const WalletPassModal = lazy(() => import('@/features/wallet/WalletPassModal'))
const TripFormPanel = lazy(() => import('@/features/trips/TripFormPanel'))
const SharePanel = lazy(() => import('@/features/trips/SharePanel'))

/** Monta un panel diferido solo desde la primera vez que hace falta. */
function useMountOnce(needed: boolean) {
  const [mounted, setMounted] = useState(needed)
  if (needed && !mounted) setMounted(true)
  return mounted
}

/**
 * El armazón de toda pantalla con sesión: avisos, barra superior, contenido con
 * scroll propio, barra inferior en móvil, «+», buscador y paneles globales.
 */
export function AppShell() {
  const { tripId: pathTripId } = useParams<{ tripId: string }>()
  const [searchParams] = useSearchParams()
  // Rutas fuera de /trips/:tripId (p. ej. /import/shared?trip=…) heredan el
  // contexto del viaje por query, para conservar su navegación.
  const tripId = pathTripId ?? searchParams.get('trip') ?? undefined
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  const mountPass = useMountOnce(useWalletPassStore(s => s.open))
  const mountTripForm = useMountOnce(useUiStore(s => !!s.tripForm))
  const mountShare = useMountOnce(useUiStore(s => !!s.shareTripId))

  const ruta = location.pathname + location.search

  // El contenedor de scroll conserva la posición entre rutas. Se reinicia al
  // cambiar de PANTALLA (no de query: abrir un panel no debe mover la lista),
  // salvo si es la ruta que se acaba de recuperar al reabrir la app.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const pendiente = tomarScrollPendiente(ruta)
    if (pendiente === null) { el.scrollTo({ top: 0 }); return }
    // La pantalla no tiene su altura definitiva al montarse: se insiste hasta
    // que quepa el scroll guardado, y a los dos segundos se deja.
    const limite = Date.now() + 2000
    let raf = 0
    const intentar = () => {
      if (el.scrollHeight - el.clientHeight >= pendiente) { el.scrollTop = pendiente; return }
      if (Date.now() > limite) return
      raf = requestAnimationFrame(intentar)
    }
    intentar()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de pantalla
  }, [location.pathname])

  // Apuntar por dónde vas leyendo: un apunte cuando el dedo para, y otro al
  // pasar a segundo plano (el momento en que iOS puede matar la app).
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let timer: number | undefined
    const anotar = () => guardarScroll(ruta, el.scrollTop)
    const alHacerScroll = () => {
      clearTimeout(timer)
      timer = window.setTimeout(anotar, 400)
    }
    const alOcultar = () => { if (document.visibilityState === 'hidden') anotar() }
    el.addEventListener('scroll', alHacerScroll, { passive: true })
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', anotar)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', alHacerScroll)
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', anotar)
    }
  }, [ruta])

  // Las pantallas a todo el alto (Plan con mapa, reproductor) se envuelven ellas
  // mismas en `h-full overflow-hidden` y gestionan su scroll; <main> no hace nada especial.
  const enReproductor = location.pathname.endsWith('/audioguide')

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background pt-safe">
      {/* Saltar al contenido: primer elemento tabulable, visible solo al enfocar */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-raised"
      >
        Saltar al contenido
      </a>
      <OfflineBanner />
      <CuentaSuspendidaBanner />
      <TopBar tripId={tripId} />
      <main
        id="contenido"
        ref={mainRef}
        tabIndex={-1}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none',
          // Hueco para la barra inferior en móvil (4rem) + zona segura.
          'pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-0',
          // Dentro de un viaje, en móvil, flota el «+»: las pantallas (<Page>) dejan
          // ese hueco al final para que lo último no quede debajo del botón.
          tripId && !enReproductor && 'max-md:[--fab-gap:3.5rem]',
        )}
      >
        <Outlet />
      </main>
      <TabBar tripId={tripId} />
      {tripId && !enReproductor && <QuickAdd tripId={tripId} floating />}
      <GlobalSearch tripId={tripId} />
      {!enReproductor && <MiniPlayer />}
      <Suspense fallback={null}>
        {mountPass && <WalletPassModal />}
        {mountTripForm && <TripFormPanel />}
        {mountShare && <SharePanel />}
      </Suspense>
    </div>
  )
}
