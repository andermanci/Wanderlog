import { cn } from '@/lib/utils'

/**
 * Rejilla de la línea de tiempo del día: hora · raíl · contenido.
 * La comparten las actividades, el alojamiento y los trayectos, para que el
 * raíl (que dibuja el contenedor del día) pase siempre por el mismo sitio.
 */
export const TIMELINE_GRID = 'grid grid-cols-[var(--tl-time)_var(--tl-rail)_minmax(0,1fr)]'
/** Variables de la rejilla y la línea vertical del raíl. Va en el contenedor de las filas. */
export const TIMELINE = cn(
  'relative [--tl-time:2.75rem] [--tl-rail:2.5rem] md:[--tl-time:3.25rem] md:[--tl-rail:3rem]',
  'before:absolute before:inset-y-3 before:left-[calc(var(--tl-time)+var(--tl-rail)/2)] before:w-px before:bg-border-strong',
)
