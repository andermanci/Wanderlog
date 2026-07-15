import { create } from 'zustand'
import type { WalletPass } from '@/lib/wallet/pass'

// Modal "cartera de iOS" con el QR/código de una reserva. Store global para
// poder abrirlo desde cualquier superficie (Documentos, Itinerario, Resumen…),
// con el modal montado una sola vez en AppLayout.
interface WalletPassState {
  open: boolean
  pass: WalletPass | null
  openPass: (pass: WalletPass) => void
  close: () => void
}

export const useWalletPassStore = create<WalletPassState>()((set) => ({
  open: false,
  pass: null,
  openPass: (pass) => set({ open: true, pass }),
  close: () => set({ open: false }),
}))
