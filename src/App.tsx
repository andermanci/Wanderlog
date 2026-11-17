import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createIdbPersister, debePersistirse } from '@/lib/queryPersister'
import { toast } from 'sonner'
import { Skeleton, Toaster } from '@/design'
import { ErrorBoundary } from '@/shell/ErrorBoundary'
import { flushOutbox } from '@/lib/offline'
import { Analytics } from '@/shell/Analytics'
import { RouteMemory, StartRoute } from '@/shell/RouteMemory'

import { useAuthListener } from '@/hooks/useAuth'
import { AdminRoute, ProtectedRoute } from '@/shell/guards'
import { AppShell } from '@/shell/AppShell'
// El guard del admin NO va diferido: son cuatro líneas, y hasta que devuelve
// <Outlet/> React Router no monta lo que envuelve, así que quien no
// administra no llega a descargar ningún chunk del panel.

// El login es la pantalla de arranque en frío: va en el bundle principal.
import { LoginPage } from '@/features/auth/LoginPage'
import { AuthCallback } from '@/features/auth/AuthCallback'

// El resto, por ruta. Sin esto, quien abre /login se descarga FullCalendar,
// Recharts y Google Maps antes de poder escribir su email.
const page = <T extends Record<string, unknown>, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] as React.ComponentType })))

const PrivacidadPage = page(() => import('@/features/auth/PrivacidadPage'), 'PrivacidadPage')
const InvitePage = page(() => import('@/features/auth/InvitePage'), 'InvitePage')
const RevolutCallback = page(() => import('@/features/money/RevolutCallback'), 'RevolutCallback')
const TripsHome = page(() => import('@/features/trips/TripsHome'), 'TripsHome')
const TripHome = page(() => import('@/features/home/TripHome'), 'TripHome')
const TripSettingsPage = page(() => import('@/features/trips/TripSettingsPage'), 'TripSettingsPage')
const PlanPage = page(() => import('@/features/plan/PlanPage'), 'PlanPage')
const VersionComparePage = page(() => import('@/features/versions/VersionComparePage'), 'VersionComparePage')
const GuidePage = page(() => import('@/features/guide/GuidePage'), 'GuidePage')
const AudioguidePage = page(() => import('@/features/guide/AudioguidePage'), 'AudioguidePage')
const WalletPage = page(() => import('@/features/wallet/WalletPage'), 'WalletPage')
const ExpensesPage = page(() => import('@/features/money/ExpensesPage'), 'ExpensesPage')
const PackingPage = page(() => import('@/features/packing/PackingPage'), 'PackingPage')
const RemindersPage = page(() => import('@/features/reminders/RemindersPage'), 'RemindersPage')
const TripMemoryPage = page(() => import('@/features/memory/TripMemoryPage'), 'TripMemoryPage')
const ImportSharedPage = page(() => import('@/features/import/ImportSharedPage'), 'ImportSharedPage')
const CalendarPage = page(() => import('@/features/calendar/CalendarPage'), 'CalendarPage')
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage')

// Panel de administración: otra aplicación dentro de esta, con layout propio.
const AdminLayout = page(() => import('@/features/admin/AdminLayout'), 'AdminLayout')
const AdminOverviewPage = page(() => import('@/features/admin/AdminOverview'), 'AdminOverviewPage')
const AdminUsersPage = page(() => import('@/features/admin/AdminUsers'), 'AdminUsersPage')
const AdminUserDetailPage = page(() => import('@/features/admin/AdminUserDetail'), 'AdminUserDetailPage')
const AdminTripsPage = page(() => import('@/features/admin/AdminTrips'), 'AdminTripsPage')
const AdminTripDetailPage = page(() => import('@/features/admin/AdminTripDetail'), 'AdminTripDetailPage')
const AdminVisitsPage = page(() => import('@/features/admin/AdminVisits'), 'AdminVisitsPage')
const AdminEventsPage = page(() => import('@/features/admin/AdminEvents'), 'AdminEventsPage')
const AdminAuditPage = page(() => import('@/features/admin/AdminAudit'), 'AdminAuditPage')

// Rutas de la interfaz anterior que ahora viven dentro del Plan. Se conservan
// como redirecciones para que los enlaces guardados sigan funcionando.
function ToPlan({ extra }: { extra: Record<string, string> }) {
  const { tripId } = useParams()
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  for (const [k, v] of Object.entries(extra)) next.set(k, v)
  return <Navigate to={{ pathname: `/trips/${tripId}/itinerary`, search: next.toString() }} replace />
}

// Versión del FORMATO de la caché persistida, no de la aplicación.
//
// PersistQueryClientProvider tira TODA la caché de localStorage cuando este
// valor no coincide con el que se guardó. Aquí había un Date.now() resuelto en
// tiempo de compilación, así que cambiaba en cada despliegue: cada vez que se
// subía cualquier cosa, a quien tuviera un viaje descargado se le borraba
// entero y se quedaba sin nada en modo avión. El síntoma era exactamente ese:
// «tengo el viaje descargado y sin conexión no me sale ningún viaje».
//
// Solo hay que subir este número cuando cambie la FORMA de lo que se cachea de
// manera incompatible (una query key que se renombra, un tipo que cambia), no
// cuando cambie el código.
const CACHE_SCHEMA = '1' 

function PageFallback() {
  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto w-full">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // gcTime largo + persistencia en localStorage: el itinerario, los
      // documentos y los gastos siguen visibles sin conexión (modo viaje).
      gcTime: 1000 * 60 * 60 * 24 * 60,
      retry: 1,
    },
  },
})

// Persiste la caché de queries en IndexedDB para uso offline. Estuvo en
// localStorage hasta que los datos de tres viajes con audioguías dejaron de
// caber en sus 5 MB; el porqué del cambio, en src/lib/queryPersister.ts.
//
// Aquí ya no hay `retry: removeOldestQuery`, y es deliberado: soltar la query
// más vieja hasta que entre es exactamente lo que dejaba la app sin la lista de
// viajes en modo avión, sin avisar a nadie. Con el presupuesto de IndexedDB no
// hace falta, y si algún día tampoco cupiera, es mejor que la escritura falle y
// se vea a que el viaje aparezca a medias.
const persister = createIdbPersister()

function AuthListener() {
  useAuthListener()
  return null
}

// Sube los cambios hechos sin conexión (gastos, diario) al volver internet.
function OfflineSync() {
  const qc = useQueryClient()
  useEffect(() => {
    const flush = () => {
      flushOutbox(qc)
        .then(n => { if (n > 0) toast.success(`${n} cambio${n > 1 ? 's' : ''} offline sincronizado${n > 1 ? 's' : ''}`) })
        .catch(() => {})
    }
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [qc])
  return null
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 60,
        buster: CACHE_SCHEMA,
        // Qué queries van a disco, y por qué NO es el filtro por defecto de
        // React Query: ver `debePersistirse` en src/lib/queryPersister.ts.
        dehydrateOptions: {
          shouldDehydrateQuery: debePersistirse,
        },
      }}
    >
      <BrowserRouter>
        <AuthListener />
        <OfflineSync />
        {/* Analítica propia: sin cookies, sin IP. Va DENTRO del router porque
            necesita useLocation, y fuera del ErrorBoundary porque no pinta
            nada y no debe reiniciarse si una pantalla falla. */}
        <Analytics />
        {/* Apunta por dónde ibas, para que <StartRoute> pueda devolverte ahí al
            reabrir la app. Fuera del ErrorBoundary por lo mismo que la
            analítica: no pinta nada y no debe reiniciarse si una pantalla falla. */}
        <RouteMemory />
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Invitación a un viaje: pública a propósito, para que quien
              todavía no tiene cuenta vea a qué le invitan antes de crearla. */}
          <Route path="/invite/:token" element={<InvitePage />} />
          {/* Pública: a quien todavía no tiene cuenta también se le mide en la
              pantalla de acceso y en las invitaciones. */}
          <Route path="/privacidad" element={<PrivacidadPage />} />

          {/* Protegidas */}
          <Route element={<ProtectedRoute />}>
            {/* Callback de importación bancaria (pantalla completa, sin armazón) */}
            <Route path="/import/revolut/callback" element={<RevolutCallback />} />

            {/* Administración: fuera de AppLayout, con su propio layout. */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="usuarios" element={<AdminUsersPage />} />
                <Route path="usuarios/:userId" element={<AdminUserDetailPage />} />
                <Route path="viajes" element={<AdminTripsPage />} />
                <Route path="viajes/:tripId" element={<AdminTripDetailPage />} />
                <Route path="visitas" element={<AdminVisitsPage />} />
                <Route path="eventos" element={<AdminEventsPage />} />
                <Route path="auditoria" element={<AdminAuditPage />} />
              </Route>
            </Route>

            <Route element={<AppShell />}>
              {/* `/` es donde aterriza el arranque en frío de la PWA: ahí se
                  decide si toca el dashboard o la pantalla donde te quedaste. */}
              <Route index element={<StartRoute />} />
              <Route path="/dashboard" element={<TripsHome />} />
              {/* Destino del «Compartir» de TikTok/Instagram y del pegar-enlace. */}
              <Route path="/import/shared" element={<ImportSharedPage />} />

              {/* Las cinco pestañas del viaje */}
              <Route path="/trips/:tripId" element={<TripHome />} />
              {/* El Plan no se desmonta al abrir una actividad: el panel sale
                  de la ruta hija y la lista y el mapa se quedan donde estaban. */}
              <Route path="/trips/:tripId/itinerary" element={<PlanPage />}>
                <Route index element={null} />
                <Route path="new" element={null} />
                <Route path=":activityId" element={null} />
                <Route path=":activityId/edit" element={null} />
              </Route>
              <Route path="/trips/:tripId/itinerary/compare" element={<VersionComparePage />} />
              <Route path="/trips/:tripId/guide" element={<GuidePage />} />
              <Route path="/trips/:tripId/itinerary/:activityId/audioguide" element={<AudioguidePage />} />
              {/* Audioguía de la ciudad del día. Cuelga de /dias y no de
                  /itinerary/:dayId/... para que no compita con :activityId. */}
              <Route path="/trips/:tripId/dias/:dayId/audioguide" element={<AudioguidePage />} />
              <Route path="/trips/:tripId/documents" element={<WalletPage />} />
              <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />

              {/* Lo que cuelga de Inicio */}
              <Route path="/trips/:tripId/packing" element={<PackingPage />} />
              <Route path="/trips/:tripId/reminders" element={<RemindersPage />} />
              <Route path="/trips/:tripId/memory" element={<TripMemoryPage />} />
              <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />

              <Route path="/trips/:tripId/map" element={<ToPlan extra={{ vista: 'mapa' }} />} />
              <Route path="/trips/:tripId/places" element={<ToPlan extra={{ tab: 'ideas' }} />} />

              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>

        <Toaster />
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}
