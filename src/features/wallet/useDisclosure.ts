import { useCallback, useState } from 'react'

/**
 * Abierto/cerrado de una ventana que enseña «algo». Al cerrar se conserva lo que
 * enseñaba, para que no se quede en blanco mientras dura la animación de salida.
 */
export function useDisclosure<T>() {
  const [state, setState] = useState<{ open: boolean; value: T | null }>({ open: false, value: null })
  const show = useCallback((value: T) => setState({ open: true, value }), [])
  const hide = useCallback(() => setState(s => ({ ...s, open: false })), [])
  return { open: state.open, value: state.value, show, hide }
}
