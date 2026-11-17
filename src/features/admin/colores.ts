import { useEffect, useState } from 'react'
import type { Tone } from '@/design'

// Tonos y colores del panel: lo que no es un componente vive aparte para no
// romper el refresco en caliente de `piezas.tsx`.

const TONOS_ESTADO: Record<string, Tone> = {
  planning: 'planning', confirmed: 'confirmed', in_progress: 'in_progress', completed: 'completed',
}
/** Tono de la insignia de estado de un viaje. */
export const tonoEstado = (estado: string): Tone => TONOS_ESTADO[estado] ?? 'neutral'

export interface ColoresGrafico {
  serie: string
  apoyo: string
  linea: string
  fondo: string
  texto: string
}

function leerColores(): ColoresGrafico {
  const cs = getComputedStyle(document.documentElement)
  const v = (nombre: string) => cs.getPropertyValue(nombre).trim()
  return {
    serie: v('--chart-1'),
    apoyo: v('--muted-foreground'),
    linea: v('--border'),
    fondo: v('--card'),
    texto: v('--foreground'),
  }
}

/**
 * Colores del tema para Recharts, que no entiende clases. Se vuelven a leer
 * cuando cambia el tema (la clase .dark de <html>).
 */
export function useColoresGrafico(): ColoresGrafico {
  const [colores, setColores] = useState(leerColores)
  useEffect(() => {
    const obs = new MutationObserver(() => setColores(leerColores()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return colores
}

/** Estilo de la cajita del tooltip de Recharts. */
export const estiloTooltip = (c: ColoresGrafico) => ({
  background: c.fondo,
  border: `1px solid ${c.linea}`,
  color: c.texto,
  borderRadius: 12,
  fontSize: 12,
})
