import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { MotionConfig } from 'framer-motion'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Skeleton } from '@/components/ui/skeleton'
import { flushOutbox } from '@/lib/offline'

import { useAuthListener } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'

// El login es la pantalla de arranque en frío: va en el bundle principal.
import { LoginPage } from '@/pages/Login'
import { AuthCallback } from '@/pages/AuthCallback'

// El resto, por ruta. Sin esto, quien abre /login se descarga FullCalendar,
// Recharts y Google Maps antes de poder escribir su email.
const InvitePage = lazy(() => import('@/pages/InvitePage').then(m => ({ default: m.InvitePage })))
const RevolutCallback = lazy(() => import('@/pages/RevolutCallback').then(m => ({ default: m.RevolutCallback })))
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const TripDetail = lazy(() => import('@/pages/TripDetail').then(m => ({ default: m.TripDetail })))
const ItineraryPage = lazy(() => import('@/pages/Itinerary').then(m => ({ default: m.ItineraryPage })))
const ActivityFormPage = lazy(() => import('@/pages/ActivityFormPage').then(m => ({ default: m.ActivityFormPage })))
const ActivityDetailPage = lazy(() => import('@/pages/ActivityDetailPage').then(m => ({ default: m.ActivityDetailPage })))
const AudioguidePage = lazy(() => import('@/pages/AudioguidePage').then(m => ({ default: m.AudioguidePage })))
const TripMemoryPage = lazy(() => import('@/pages/TripMemoryPage').then(m => ({ default: m.TripMemoryPage })))
const MapViewPage = lazy(() => import('@/pages/MapView').then(m => ({ default: m.MapViewPage })))
const SavedPlacesPage = lazy(() => import('@/pages/SavedPlacesPage').then(m => ({ default: m.SavedPlacesPage })))
const ImportSharedPage = lazy(() => import('@/pages/ImportSharedPage').then(m => ({ default: m.ImportSharedPage })))
const DocumentsPage = lazy(() => import('@/pages/Documents').then(m => ({ default: m.DocumentsPage })))
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const RemindersPage = lazy(() => import('@/pages/RemindersPage').then(m => ({ default: m.RemindersPage })))
const PackingPage = lazy(() => import('@/pages/PackingPage').then(m => ({ default: m.PackingPage })))
const ExpensesPage = lazy(() => import('@/pages/ExpensesPage').then(m => ({ default: m.ExpensesPage })))
const GuidePage = lazy(() => import('@/pages/GuidePage').then(m => ({ default: m.GuidePage })))
const TripSettingsPage = lazy(() => import('@/pages/TripSettingsPage').then(m => ({ default: m.TripSettingsPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsPage })))

declare const __APP_VERSION__: string

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

// Persiste la caché de queries en localStorage para uso offline.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'wanderlog-cache',
})

// En móvil los toasts van centrados arriba (arriba-derecha choca con el notch).
const IS_MOBILE = window.matchMedia('(max-width: 767px)').matches

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
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 60, buster: __APP_VERSION__ }}
    >
      {/* framer-motion anima con estilos en línea, así que el bloque
          @media (prefers-reduced-motion) de index.css no lo frena: hay que
          decírselo aquí para que respete la preferencia del sistema. */}
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthListener />
        <OfflineSync />
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Invitación a un viaje: pública a propósito, para que quien
              todavía no tiene cuenta vea a qué le invitan antes de crearla. */}
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* Protegidas */}
          <Route element={<ProtectedRoute />}>
            {/* Callback de importación bancaria (pantalla completa, sin sidebar) */}
            <Route path="/import/revolut/callback" element={<RevolutCallback />} />

            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              {/* Destino del "Compartir" de TikTok/Instagram y del pegar-enlace. */}
              <Route path="/import/shared" element={<ImportSharedPage />} />

              <Route path="/trips/:tripId" element={<TripDetail />} />
              <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
              <Route path="/trips/:tripId/itinerary/new" element={<ActivityFormPage />} />
              <Route path="/trips/:tripId/itinerary/:activityId" element={<ActivityDetailPage />} />
              <Route path="/trips/:tripId/itinerary/:activityId/edit" element={<ActivityFormPage />} />
              <Route path="/trips/:tripId/itinerary/:activityId/audioguide" element={<AudioguidePage />} />
              <Route path="/trips/:tripId/memory" element={<TripMemoryPage />} />
              <Route path="/trips/:tripId/map" element={<MapViewPage />} />
              <Route path="/trips/:tripId/places" element={<SavedPlacesPage />} />
              <Route path="/trips/:tripId/documents" element={<DocumentsPage />} />
              <Route path="/trips/:tripId/reminders" element={<RemindersPage />} />
              <Route path="/trips/:tripId/packing" element={<PackingPage />} />
              <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
              <Route path="/trips/:tripId/guide" element={<GuidePage />} />
              <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />

              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>

        <Toaster
          position={IS_MOBILE ? 'top-center' : 'top-right'}
          toastOptions={{
            style: {
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            },
          }}
        />
      </BrowserRouter>
      </MotionConfig>
    </PersistQueryClientProvider>
  )
}
