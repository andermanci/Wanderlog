import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { effectiveStatus } from '@/lib/utils'

// 'auto': decide según el estado del viaje. 'edit'/'view': elección explícita
// del usuario, recordada entre viajes (persistida por dispositivo).
export type ItineraryMode = 'auto' | 'edit' | 'view'

interface ItineraryModeState {
  mode: ItineraryMode
  setMode: (m: ItineraryMode) => void
}

export const useItineraryModeStore = create<ItineraryModeState>()(
  persist(
    (set) => ({
      mode: 'auto',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'wanderlog-itinerary-mode' },
  ),
)

// ¿Estamos en modo edición? En 'auto' se edita mientras se planifica
// (planning/confirmed) y se pasa a "ver" cuando el viaje empieza o termina.
export function resolveEditMode(
  mode: ItineraryMode,
  trip?: { start_date: string; end_date: string; status: string } | null,
): boolean {
  if (mode === 'edit') return true
  if (mode === 'view') return false
  if (!trip) return true
  const status = effectiveStatus(trip)
  return status === 'planning' || status === 'confirmed'
}
