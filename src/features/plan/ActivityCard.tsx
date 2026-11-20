import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BedDouble, Check, ExternalLink, GripVertical, Headphones, MapPin, Pencil, QrCode, Trash2 } from 'lucide-react'
import { ActivityIcon, Menu, Photo } from '@/design'
import { ACTIVITY_LABELS, cn, formatCurrency } from '@/lib/utils'
import { isMove } from '@/lib/travelTime'
import { displayCover } from '@/lib/queries/itinerary'
import { useWalletPassStore } from '@/store/walletPassStore'
import { buildAttachmentPass } from '@/lib/wallet/pass'
import type { Lodging } from '@/lib/lodging'
import type { Activity, ActivityAttachment } from '@/types/database'
import { usePlanStore } from './planStore'
import { TIMELINE_GRID } from './timeline'

/** Una fila del raíl sin hora ni nodo: para lo que va ENTRE dos paradas (un trayecto). */
export function TimelineGap({ children }: { children: ReactNode }) {
  return (
    <div className={TIMELINE_GRID}>
      <span /><span />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** El asa de arrastre (solo editando). */
function Handle({ title, attributes, listeners }: { title: string } & Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>) {
  return (
    <button
      type="button" {...attributes} {...listeners}
      aria-label={`Mover ${title}`} title="Arrastra para mover"
      className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-5" aria-hidden="true" />
    </button>
  )
}

interface ActivityCardProps {
  tripId: string
  activity: Activity
  /** Id de arrastre con ámbito por día («activityId::dayId»). */
  sortableId: string
  attachments?: ActivityAttachment[]
  hasAudioguide?: boolean
  /** Editando: asa de arrastre y menú. Viendo: el nodo del raíl marca la actividad como hecha. */
  editMode: boolean
  currency?: string
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
  onToggleDone: (a: Activity) => void
}

/**
 * Una parada del día en la línea de tiempo: la hora a la izquierda, su icono
 * sobre el raíl y, a la derecha, lo que es. Se pulsa para abrirla.
 */
export function ActivityCard({ tripId, activity: a, sortableId, attachments = [], hasAudioguide, editMode, currency, onEdit, onDelete, onToggleDone }: ActivityCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const openPass = useWalletPassStore(s => s.openPass)
  const hovered = usePlanStore(s => s.hoveredActivityId === a.id)
  const setHovered = usePlanStore(s => s.setHoveredActivity)
  const cover = displayCover(a.cover_image_url)
  const where = isMove(a) && (a.origin || a.destination)
    ? `${a.origin ?? ''}${a.origin && a.destination ? ' → ' : ''}${a.destination ?? ''}`
    : a.address
  const otherDay = !!a.end_day_id && a.end_day_id !== a.day_id

  const node = (
    // El tono suave es translúcido: va sobre una base opaca que tapa el raíl.
    <span className="block rounded-full bg-background ring-4 ring-background">
      <span className={cn(
        'grid size-9 place-items-center rounded-full transition-colors duration-150 md:size-10',
        a.done ? 'bg-success text-white dark:text-background' : 'bg-tone-soft text-tone',
      )}>
        {a.done ? <Check className="size-5" strokeWidth={3} aria-hidden="true" /> : <ActivityIcon type={a.type} className="size-[1.125rem] md:size-5" />}
      </span>
    </span>
  )

  return (
    <div
      ref={setNodeRef}
      data-tone={a.type}
      // dnd-kit mueve la fila con transform: cambia en cada fotograma.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseEnter={() => setHovered(a.id)}
      onMouseLeave={() => setHovered(null)}
      className={cn(TIMELINE_GRID, 'relative items-start py-1', isDragging && 'z-10 opacity-70')}
    >
      {/* Hora */}
      <div className="pt-2.5 pr-1 text-right leading-tight">
        {a.start_time && <p className="text-sm font-semibold tabular-nums">{a.start_time.slice(0, 5)}</p>}
        {a.end_time && <p className="text-xs tabular-nums text-muted-foreground">{a.end_time.slice(0, 5)}</p>}
      </div>

      {/* Nodo sobre el raíl. Viendo el plan, se pulsa para marcar la parada como hecha. */}
      <div className="flex justify-center pt-1.5">
        {editMode ? node : (
          <button
            type="button" onClick={() => onToggleDone(a)} aria-pressed={a.done}
            aria-label={a.done ? `Marcar ${a.title} como pendiente` : `Marcar ${a.title} como hecha`}
            title={a.done ? 'Hecha. Pulsa para desmarcarla' : 'Pulsa para marcarla como hecha'}
            className="rounded-full transition-transform active:scale-90"
          >
            {node}
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className={cn(
        'relative min-w-0 rounded-2xl border bg-card transition-[box-shadow,border-color,opacity] duration-150',
        hovered ? 'border-tone-line shadow-raised' : 'border-border shadow-card',
        a.done && 'opacity-60',
      )}>
       <div className="flex min-w-0 items-start gap-1">
        <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="flex min-w-0 flex-1 items-stretch gap-3 py-3 pl-4">
          <span className="min-w-0 flex-1">
            <span className="eyebrow block text-tone">{ACTIVITY_LABELS[a.type]}</span>
            {/* Sin «block»: le gana a «line-clamp» (los dos fijan display) y el texto salía entero. */}
            <span className={cn('mt-0.5 font-serif text-lg font-medium leading-snug tracking-tight line-clamp-2', a.done && 'line-through')}>{a.title}</span>
            {where && (
              <span className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1 break-words">{where}</span>
              </span>
            )}
            {a.description && <span className="mt-1 text-sm text-muted-foreground line-clamp-2 break-words">{a.description}</span>}
            {(hasAudioguide || a.price != null || otherDay) && (
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                {otherDay && <span className="text-accent-foreground">{a.type === 'hotel' ? 'Estancia' : 'Llega otro día'}</span>}
                {hasAudioguide && <span className="flex items-center gap-1 text-accent-foreground"><Headphones className="size-3.5" aria-hidden="true" /> Audioguía</span>}
                {a.price != null && <span className="tabular-nums">{formatCurrency(a.price, currency)}</span>}
              </span>
            )}
          </span>
          <Photo src={cover} alt="" loading="lazy" className="w-20 shrink-0 self-stretch rounded-xl object-cover md:w-24" />
        </Link>

        <div className="flex shrink-0 flex-col items-center py-1.5 pr-1.5">
          <Menu
            label={`Opciones de ${a.title}`}
            items={[
              a.external_link ? { label: 'Abrir enlace', icon: ExternalLink, onSelect: () => window.open(a.external_link!, '_blank', 'noopener') } : null,
              editMode && { label: 'Editar', icon: Pencil, onSelect: () => onEdit(a) },
              editMode && { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(a) },
            ]}
          />
          {editMode && <Handle title={a.title} attributes={attributes} listeners={listeners} />}
        </div>

       </div>

        {/* Entradas y códigos: a un toque, sin abrir la actividad. Dentro de la
            tarjeta y en varias líneas si hace falta: antes flotaban sobre el borde
            y, con nombres largos, se montaban entre sí y sobre el trayecto. */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
            {attachments.map(att => (
              <button
                key={att.id} type="button"
                title={`Mostrar ${att.name}`}
                onClick={() => openPass(buildAttachmentPass(att, a))}
                className="inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-semibold text-accent-foreground transition-colors hover:brightness-95"
              >
                <QrCode className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{att.name.replace(/\.(jpe?g|png|webp|heic|pdf)$/i, '')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Dónde duermes ese día: una parada más del raíl, sin hora, que se ordena junto al resto. */
export function LodgingRow({ tripId, lodging: l, sortableId, editMode }: { tripId: string; lodging: Lodging; sortableId: string; editMode: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const role = l.role === 'single' ? 'Una noche'
    : l.role === 'out' ? 'Dejas el hotel'
      : l.role === 'in' ? `Llegas al hotel · noche 1 de ${l.nights}`
        : `Noche ${l.night} de ${l.nights}`
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-tone="hotel"
      className={cn(TIMELINE_GRID, 'items-center py-1', isDragging && 'z-10 opacity-70')}
    >
      <span />
      <div className="flex justify-center">
        <span className="block rounded-full bg-background ring-4 ring-background">
          <span className="grid size-9 place-items-center rounded-full bg-tone-soft text-tone md:size-10">
            <BedDouble className="size-[1.125rem] md:size-5" aria-hidden="true" />
          </span>
        </span>
      </div>
      <div className="flex min-w-0 items-center rounded-2xl border border-dashed border-tone-line bg-tone-soft">
        <Link to={`/trips/${tripId}/itinerary/${l.activity.id}`} className="min-w-0 flex-1 py-2.5 pl-4">
          <span className="block truncate font-serif text-base font-medium">{l.activity.title}</span>
          <span className="block text-sm text-muted-foreground">{role}</span>
        </Link>
        {editMode && <span className="pr-1.5"><Handle title={l.activity.title} attributes={attributes} listeners={listeners} /></span>}
      </div>
    </div>
  )
}
