import { Link } from 'react-router-dom'
import { BedDouble, Check, Navigation } from 'lucide-react'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { displayCover } from '@/lib/queries/itinerary'
import { ACTIVITY_COLORS } from '@/lib/utils'
import type { DayEntry } from '@/lib/today'
import type { DirectionsTarget } from '@/lib/directions'
import type { Activity } from '@/types/database'

// El día como un solo hilo cronológico. Antes esto estaban repartido en dos
// sitios —una tarjeta con "lo siguiente" arriba y la lista del resto al final,
// con los accesos rápidos y los datos del destino en medio—, así que no se veía
// la forma del día. Aquí hay una única línea de tiempo y dentro de ella una
// parada destacada: la de ahora.

interface TodayTimelineProps {
  tripId: string
  entries: DayEntry[]
  /** Actividad que ocupa el sitio protagonista (la de ahora, o la siguiente). */
  focusId: string | null
  /** Dónde duermes: cierra el día como última parada. */
  lodging?: Activity | null
  onDirections: (t: DirectionsTarget) => void
  /** Destino navegable de una actividad, o null si no hay a dónde ir. */
  targetOf: (a: Activity) => DirectionsTarget | null
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export function TodayTimeline({
  tripId, entries, focusId, lodging, onDirections, targetOf,
}: TodayTimelineProps) {
  // El alojamiento va al final como una parada más, sin hora: el día termina
  // donde duermes.
  const rows = [
    ...entries.map(e => ({ kind: 'activity' as const, entry: e })),
    ...(lodging ? [{ kind: 'lodging' as const, entry: null }] : []),
  ]
  if (!rows.length) return null

  return (
    <ol className="mb-4">
      {rows.map((row, i) => {
        const first = i === 0
        const last = i === rows.length - 1

        if (row.kind === 'lodging') {
          return (
            <Rail key="lodging" time={null} tone="muted" first={first} last={last}>
              <Link
                to={`/trips/${tripId}/itinerary/${lodging!.id}`}
                className="flex items-center gap-2 py-1 text-sm min-w-0"
              >
                <BedDouble size={14} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
                <span className="text-muted-foreground flex-shrink-0">Esta noche</span>
                <span className="font-medium truncate">{lodging!.title}</span>
              </Link>
            </Rail>
          )
        }

        const { activity: a, state, relative, progress } = row.entry
        const focused = a.id === focusId
        const color = ACTIVITY_COLORS[a.type]
        const tone = state === 'past' ? 'muted' : focused ? 'accent' : 'normal'

        return (
          <Rail key={a.id} time={hhmm(a.start_time)} tone={tone} first={first} last={last}>
            {focused ? (
              <FocusCard
                tripId={tripId} activity={a} state={state} relative={relative}
                progress={progress} color={color}
                target={targetOf(a)} onDirections={onDirections}
              />
            ) : (
              <Link
                to={`/trips/${tripId}/itinerary/${a.id}`}
                className="flex items-center gap-2 py-1 min-w-0 transition-opacity hover:opacity-80"
              >
                <ActivityIcon type={a.type} size={14} style={{ color }} className="flex-shrink-0" />
                <span className={`text-sm flex-1 min-w-0 truncate ${
                  a.done ? 'line-through text-muted-foreground' : state === 'past' ? 'text-muted-foreground' : ''
                }`}>
                  {a.title}
                </span>
                {a.done && <Check size={13} className="flex-shrink-0" style={{ color: 'var(--success)' }} aria-label="Hecho" />}
              </Link>
            )}
          </Rail>
        )
      })}
    </ol>
  )
}

// Una fila del hilo: hora, punto sobre la línea y contenido.
function Rail({ time, tone, first, last, children }: {
  time: string | null
  tone: 'muted' | 'normal' | 'accent'
  first: boolean
  last: boolean
  children: React.ReactNode
}) {
  const dot = tone === 'accent'
    ? { background: 'var(--primary)', width: 11, height: 11 }
    : tone === 'muted'
      ? { background: 'var(--border)', width: 7, height: 7 }
      : { background: 'var(--muted-foreground)', width: 7, height: 7 }

  return (
    <li className="flex gap-2.5">
      <span className={`w-10 flex-shrink-0 pt-1 text-[11px] tabular-nums text-right ${
        tone === 'muted' ? 'text-muted-foreground/60' : 'text-muted-foreground'
      }`}>
        {time ?? ''}
      </span>

      {/* Raíl: la línea se corta en la primera y la última parada para que el
          hilo empiece y acabe en un punto, no en el aire. */}
      <span className="relative w-3 flex-shrink-0 flex justify-center" aria-hidden="true">
        {!first && <span className="absolute top-0 h-2.5 w-px" style={{ background: 'var(--border)' }} />}
        {!last && <span className="absolute top-2.5 bottom-0 w-px" style={{ background: 'var(--border)' }} />}
        <span
          className="absolute rounded-full"
          style={{ ...dot, top: 10 - dot.height / 2, boxShadow: '0 0 0 3px var(--hub-bg)' }}
        />
      </span>

      <div className={`flex-1 min-w-0 ${last ? '' : 'pb-2'}`}>{children}</div>
    </li>
  )
}

// La parada destacada: lo único de la tarjeta que se lee de un vistazo desde
// lejos. Lleva la cuenta atrás, que es el dato que de verdad se mira ("¿cuánto
// me queda aquí?"), y una barra con lo que va transcurrido.
function FocusCard({ tripId, activity: a, state, relative, progress, color, target, onDirections }: {
  tripId: string
  activity: Activity
  state: DayEntry['state']
  relative: string
  progress: number | null
  color: string
  target: DirectionsTarget | null
  onDirections: (t: DirectionsTarget) => void
}) {
  const cover = displayCover(a.cover_image_url)
  const label = state === 'current' ? 'Ahora' : state === 'upcoming' ? 'A continuación' : 'Lo último de hoy'

  return (
    <Link
      to={`/trips/${tripId}/itinerary/${a.id}`}
      className="block rounded-xl p-3 mb-1 surface transition-shadow hover:shadow-sm"
      style={{ borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)' }}
    >
      {/* El botón de "cómo llegar" va arriba, con la etiqueta, y no al lado del
          título: dentro del raíl quedan ~285 px, y meterlo en la misma fila
          dejaba el título en 158 px, partiendo cualquier nombre normal en dos
          líneas con puntos suspensivos. Sin chevron por lo mismo: la tarjeta
          entera ya es el enlace. */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="flex items-baseline gap-1.5 flex-wrap text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--primary)' }}>
          {label}
          {relative && (
            <span className="font-medium normal-case tracking-normal text-muted-foreground">· {relative}</span>
          )}
        </p>
        {target && (
          <button
            type="button"
            aria-label={`Cómo llegar a ${a.title}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDirections(target) }}
            className="flex items-center justify-center w-8 h-8 -mt-1.5 -mr-1 rounded-lg flex-shrink-0 transition-colors hover:brightness-110"
            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
          >
            <Navigation size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {cover ? (
          <img src={cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
            <ActivityIcon type={a.type} size={18} style={{ color }} />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium leading-snug line-clamp-2">{a.title}</p>
          {a.start_time && (
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {a.start_time.slice(0, 5)}{a.end_time && ` — ${a.end_time.slice(0, 5)}`}
            </p>
          )}
        </div>
      </div>

      {progress != null && (
        <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--secondary)' }}>
          <div className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--primary)' }} />
        </div>
      )}
    </Link>
  )
}
