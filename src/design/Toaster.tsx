import { Toaster as Sonner } from 'sonner'
import { useA11yStore } from '@/store/a11yStore'
import { useIsMobile } from './useIsMobile'

/** Avisos breves. Siguen el tema elegido en Ajustes (antes iban siempre con el del sistema). */
export function Toaster() {
  const theme = useA11yStore(s => s.theme)
  const mobile = useIsMobile()
  return (
    <Sonner
      theme={theme}
      // En móvil, centrados arriba: arriba a la derecha chocan con el notch.
      position={mobile ? 'top-center' : 'top-right'}
      offset={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      toastOptions={{
        style: {
          background: 'var(--popover)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-raised)',
          fontFamily: 'var(--font-sans)',
        },
      }}
    />
  )
}
