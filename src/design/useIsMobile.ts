import { useSyncExternalStore } from 'react'

// El mismo corte que `md:` en Tailwind: por debajo, móvil (barra inferior y hojas).
const QUERY = '(max-width: 767px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** ¿Pantalla de móvil? Reacciona al girar o redimensionar. Para estilos, usa `md:`; esto es para lógica. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
