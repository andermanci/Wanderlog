import type { ReactNode } from 'react'
import { Star, X } from 'lucide-react'
import { IconButton } from '@/design'

interface Props {
  /** Tono del icono (tipo de actividad o categoría del lugar). */
  tone: string
  icon: ReactNode
  title: string
  /** Etiquetas bajo el título (lista, «Guardado»…). */
  badges?: ReactNode
  address?: string | null
  /** Línea de contexto (el día de la parada). */
  meta?: ReactNode
  rating?: number | null
  note?: string | null
  /** Menú «⋯» junto a cerrar. */
  menu?: ReactNode
  onClose: () => void
  /** Los botones de acción. */
  children: ReactNode
}

/**
 * La tarjeta que sale abajo al tocar un pin. Es la misma para un resultado de
 * búsqueda, un lugar guardado o una parada del plan; solo cambian las acciones.
 */
export function SelectionCard({ tone, icon, title, badges, address, meta, rating, note, menu, onClose, children }: Props) {
  return (
    <div
      role="region" aria-label={title}
      className="animate-pop-in absolute bottom-3 left-3 right-20 z-20 max-h-[70%] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 shadow-float md:bottom-8 md:right-auto md:w-96"
    >
      <div className="flex items-start gap-3">
        <span data-tone={tone} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone [&_svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="title-card break-words">{title}</h3>
          {badges && <div className="mt-1 flex flex-wrap gap-1.5">{badges}</div>}
        </div>
        <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center">
          {menu}
          <IconButton label="Cerrar" size="sm" onClick={onClose}><X /></IconButton>
        </div>
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        {address && <p className="break-words">{address}</p>}
        {meta && <p className="first-letter:uppercase">{meta}</p>}
        {rating != null && rating > 0 && (
          <p className="flex items-center gap-1 font-medium text-foreground tabular-nums">
            <Star className="size-4 text-warning" aria-hidden="true" /> {rating} <span className="font-normal text-muted-foreground">de 5</span>
          </p>
        )}
      </div>
      {note && <p className="mt-2.5 whitespace-pre-line rounded-xl bg-sunken px-3 py-2 text-sm">{note}</p>}

      <div className="mt-3.5 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
