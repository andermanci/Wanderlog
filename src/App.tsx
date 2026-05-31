import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'

import { useAuthListener } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'

import { LoginPage } from '@/pages/Login'
import { AuthCallback } from '@/pages/AuthCallback'
import { Dashboard } from '@/pages/Dashboard'
import { TripDetail } from '@/pages/TripDetail'
import { ItineraryPage } from '@/pages/Itinerary'
import { MapViewPage } from '@/pages/MapView'
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
      retry: 1,
    },
  },
})

function AuthListener() {
  useAuthListener()
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthListener />
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              <Route path="/trips/:tripId" element={<TripDetail />} />
              <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
              <Route path="/trips/:tripId/map" element={<MapViewPage />} />
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
              background: '#12121a',
              border: '1px solid #2a2a3a',
              color: '#f5f0e8',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
