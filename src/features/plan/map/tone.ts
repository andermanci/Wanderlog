import { useEffect, useState } from 'react'
import { toneColor } from '@/design'

// Google Maps pinta las líneas en un lienzo y no entiende todos los formatos de
// color de CSS (los tokens son oklch). Se pasa por un <canvas>, que devuelve el
// color ya resuelto en hexadecimal.
function toHex(color: string): string {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return color
  const probe = '#010203'
  ctx.fillStyle = probe
  ctx.fillStyle = color
  // Si el navegador no entendió el color, fillStyle se queda como estaba.
  return ctx.fillStyle === probe ? color : String(ctx.fillStyle)
}

/**
 * Color real de un tono del sistema de diseño, para lo que no es DOM (la línea
 * del recorrido). Se recalcula si cambia el tema claro/oscuro.
 */
export function useToneHex(tone: string): string {
  const [hex, setHex] = useState(() => toHex(toneColor(tone)))
  useEffect(() => {
    const update = () => setHex(toHex(toneColor(tone)))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => { mq.removeEventListener('change', update); mo.disconnect() }
  }, [tone])
  return hex
}
