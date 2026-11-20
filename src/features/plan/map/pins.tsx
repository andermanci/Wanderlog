import type { ReactNode } from 'react'
import { PlaceIcon } from '@/design'
import { cn } from '@/lib/utils'

// Los pines son DOM dentro del mapa: toman el color de `data-tone`, igual que
// el resto de la app, y cambian solos con el tema.

/**
 * Parada del plan: disco numerado del color de su tipo. Con `label` (al ver un
 * día concreto) lleva al lado la hora y el nombre, para leer el día sobre el mapa.
 */
export function StopPin({ n, tone, active, title, label, time, onHover }: {
  n: number
  tone: string
  active: boolean
  title: string
  /** Nombre corto junto al pin. Sin él, solo el número. */
  label?: string
  time?: string | null
  onHover: (over: boolean) => void
}) {
  return (
    // El disco mide 32 px y el área pulsable ronda los 44 px (relleno).
    <div
      data-tone={tone}
      className="group relative flex cursor-pointer items-center p-1.5"
      title={title}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div
        className={cn(
          'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-[2.5px] border-white bg-tone text-sm font-bold tabular-nums text-white shadow-raised transition-transform duration-150 dark:border-background dark:text-background',
          active ? 'scale-125' : 'group-hover:scale-110',
        )}
      >
        {n}
      </div>
      {label && (
        <div className={cn(
          '-ml-2.5 flex max-w-44 items-center gap-1.5 rounded-r-full border border-l-0 border-border bg-card py-1 pl-4 pr-3 text-xs shadow-card transition-opacity',
          active ? 'opacity-100' : 'opacity-95',
        )}>
          {time && <span className="shrink-0 font-semibold tabular-nums text-tone">{time}</span>}
          <span className="truncate font-medium text-foreground">{label}</span>
        </div>
      )}
    </div>
  )
}

/** Gota con un disco claro dentro: la punta cae exacta sobre el sitio. */
function Drop({ tone, active, title, children }: { tone: string; active: boolean; title: string; children: ReactNode }) {
  return (
    <div
      data-tone={tone}
      title={title}
      className={cn('relative h-[42px] w-8 origin-bottom cursor-pointer text-tone drop-shadow-md transition-transform duration-150', active ? 'scale-125' : 'hover:scale-110')}
    >
      <svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true">
        <path
          d="M16 1 C7.7 1 1 7.7 1 16 C1 26 16 41 16 41 C16 41 31 26 31 16 C31 7.7 24.3 1 16 1 Z"
          fill="currentColor" strokeWidth={2} className="stroke-card"
        />
        <circle cx="16" cy="16" r={active ? 10 : 9.5} className="fill-card" />
      </svg>
      <span className="absolute inset-x-0 top-[9px] flex justify-center">{children}</span>
    </div>
  )
}

/** Lugar guardado: gota del color de su categoría con su icono. */
export function FavoritePin({ category, active, title }: { category: string; active: boolean; title: string }) {
  return (
    <Drop tone={category} active={active} title={title}>
      <PlaceIcon category={category} className="size-3.5" strokeWidth={2.4} />
    </Drop>
  )
}

/** Resultado de búsqueda: gota del color principal, más tenue si no es el elegido. */
export function ResultPin({ active, title }: { active: boolean; title: string }) {
  return (
    <div className={cn(!active && 'opacity-75')}>
      <Drop tone="primary" active={active} title={title}>
        <span className="mt-[3px] size-2 rounded-full bg-tone" />
      </Drop>
    </div>
  )
}

/** El punto azul de «estoy aquí». */
export function MyLocationDot() {
  return (
    <div data-tone="info" className="relative" title="Tu ubicación">
      <span className="absolute inset-0 animate-ping rounded-full bg-tone opacity-40" />
      <span className="relative block size-4 rounded-full border-2 border-card bg-tone shadow-card" />
    </div>
  )
}
