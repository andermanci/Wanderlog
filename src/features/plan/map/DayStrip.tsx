import { ActivityIcon } from '@/design'
import { cn, formatDate, ACTIVITY_LABELS } from '@/lib/utils'
import type { RoutePoint } from '@/lib/route'
import type { Activity } from '@/types/database'

export interface DayStop {
  point: RoutePoint
  activity?: Activity
  time: string | null
}

/**
 * La agenda del día, abajo del mapa: una tarjeta por parada, en orden, con su
 * número (el mismo que el pin), la hora y qué es. Tocar una centra el mapa en ella.
 */
export function DayStrip({ date, stops, activeKey, onSelect, onHover }: {
  date: string
  stops: DayStop[]
  activeKey: string | null
  onSelect: (p: RoutePoint) => void
  onHover: (activityId: string | null) => void
}) {
  return (
    <section
      aria-label={`Paradas del ${formatDate(date, "EEEE d 'de' MMMM")}`}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <p className="pointer-events-auto mx-3 mb-2 inline-flex items-center gap-2 rounded-full bg-card/95 px-3 py-1 text-xs font-semibold shadow-card backdrop-blur">
        <span className="first-letter:uppercase">{formatDate(date, "EEEE d 'de' MMMM")}</span>
        <span className="font-normal text-muted-foreground">· {stops.length} {stops.length === 1 ? 'parada' : 'paradas'}</span>
      </p>
      {/* A la derecha se deja hueco en móvil para el botón «+». */}
      <ol className="no-scrollbar pointer-events-auto flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pr-20 md:pr-3">
        {stops.map(({ point: p, activity, time }, i) => {
          const tone = activity?.type ?? 'place'
          const active = activeKey === p.key
          return (
            <li key={p.key} data-tone={tone} className="snap-start">
              <button
                type="button"
                onClick={() => onSelect(p)}
                onMouseEnter={() => onHover(p.activityId)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  'flex w-56 items-center gap-3 rounded-2xl border bg-card p-2.5 pr-3 text-left shadow-raised transition-[border-color,transform] duration-150 active:scale-[0.98]',
                  active ? 'border-tone' : 'border-border',
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tone text-sm font-bold tabular-nums text-white dark:text-background">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs">
                    {time && <span className="font-semibold tabular-nums">{time}</span>}
                    <span className="flex min-w-0 items-center gap-1 truncate text-tone">
                      <ActivityIcon type={tone} className="size-3.5 shrink-0" />
                      {p.kind === 'origin' ? 'Salida' : p.kind === 'destination' ? 'Llegada' : ACTIVITY_LABELS[tone] ?? 'Parada'}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-serif text-base font-medium leading-tight">{p.label}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
