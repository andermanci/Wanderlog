import { create } from 'zustand'

// Paneles globales que se abren desde cualquier sitio (barra superior, tarjetas,
// menús) y se montan UNA vez en el armazón.
interface UiState {
  /** Panel «Compartir viaje»: id del viaje, o null si está cerrado. */
  shareTripId: string | null
  openShare: (tripId: string) => void
  closeShare: () => void
  /** Panel de crear/editar viaje. `tripId` vacío = crear. */
  tripForm: { tripId?: string } | null
  openTripForm: (tripId?: string) => void
  closeTripForm: () => void
}

export const useUiStore = create<UiState>()(set => ({
  shareTripId: null,
  openShare: tripId => set({ shareTripId: tripId }),
  closeShare: () => set({ shareTripId: null }),
  tripForm: null,
  openTripForm: tripId => set({ tripForm: { tripId } }),
  closeTripForm: () => set({ tripForm: null }),
}))
