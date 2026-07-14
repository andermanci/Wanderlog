import { create } from 'zustand'

// Apertura de la paleta de búsqueda del viaje (Cmd+K / botón lupa).
// Store para poder abrirla desde cualquier superficie (TripHeader, atajo).
interface TripSearchState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useTripSearchStore = create<TripSearchState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
