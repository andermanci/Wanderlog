import type { ReactNode } from 'react'
import { PlaceIcon } from '@/design'
import { cn } from '@/lib/utils'

// Los pines son DOM dentro del mapa: toman el color de `data-tone`, igual que
// el resto de la app, y cambian solos con el tema.

/** Parada del plan: círculo numerado con el color del tipo de actividad. */
export function StopPin({ n, tone, active, title, onHover }: {
  n: number
  tone: string
  active: boolean
  title: string
  onHover: (over: boolean) => void
}) {
  return (
    // El círculo mide 24 px, pero el área pulsable ronda los 44 px (relleno).
    <div className="cursor-pointer p-2.5" title={title} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <div
        data-tone={tone}
        className={cn(
          'grid size-6 place-items-center rounded-full border-2 border-card bg-tone text-2xs font-bold tabular-nums text-white shadow-raised transition-transform duration-150 dark:text-background',
          active && 'scale-[1.35] ring-2 ring-card',
        )}
      >
        {n}
      </div>
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
