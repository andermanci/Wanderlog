import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { flushOutbox } from '@/lib/offline'

import { useAuthListener } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'

import { LoginPage } from '@/pages/Login'
import { AuthCallback } from '@/pages/AuthCallback'
import { RevolutCallback } from '@/pages/RevolutCallback'
import { Dashboard } from '@/pages/Dashboard'
import { TripDetail } from '@/pages/TripDetail'
import { ItineraryPage } from '@/pages/Itinerary'
import { ActivityFormPage } from '@/pages/ActivityFormPage'
import { ActivityDetailPage } from '@/pages/ActivityDetailPage'
import { TripMemoryPage } from '@/pages/TripMemoryPage'
import { MapViewPage } from '@/pages/MapView'
import { SavedPlacesPage } from '@/pages/SavedPlacesPage'
import { DocumentsPage } from '@/pages/Documents'
import { CalendarPage } from '@/pages/CalendarPage'
import { RemindersPage } from '@/pages/RemindersPage'
import { PackingPage } from '@/pages/PackingPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SettingsPage } from '@/pages/Settings'

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
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 60 }}
    >
      <BrowserRouter>
        <AuthListener />
        <OfflineSync />
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protegidas */}
          <Route element={<ProtectedRoute />}>
            {/* Callback de importación bancaria (pantalla completa, sin sidebar) */}
            <Route path="/import/revolut/callback" element={<RevolutCallback />} />

            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              <Route path="/trips/:tripId" element={<TripDetail />} />
              <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
              <Route path="/trips/:tripId/itinerary/new" element={<ActivityFormPage />} />
              <Route path="/trips/:tripId/itinerary/:activityId" element={<ActivityDetailPage />} />
              <Route path="/trips/:tripId/itinerary/:activityId/edit" element={<ActivityFormPage />} />
              <Route path="/trips/:tripId/memory" element={<TripMemoryPage />} />
              <Route path="/trips/:tripId/map" element={<MapViewPage />} />
              <Route path="/trips/:tripId/places" element={<SavedPlacesPage />} />
              <Route path="/trips/:tripId/documents" element={<DocumentsPage />} />
              <Route path="/trips/:tripId/reminders" element={<RemindersPage />} />
              <Route path="/trips/:tripId/packing" element={<PackingPage />} />
              <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />

              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            },
          }}
        />
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}
