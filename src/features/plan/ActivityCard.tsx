import { Link } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BedDouble, Clock, ExternalLink, GripVertical, Headphones, MapPin, Pencil, QrCode, Trash2 } from 'lucide-react'
import { ActivityIcon, Badge, Checkbox, Menu } from '@/design'
import { ACTIVITY_LABELS, cn, formatCurrency } from '@/lib/utils'
import { isMove } from '@/lib/travelTime'
import { displayCover } from '@/lib/queries/itinerary'
import { useWalletPassStore } from '@/store/walletPassStore'
import { buildAttachmentPass } from '@/lib/wallet/pass'
import type { Lodging } from '@/lib/lodging'
import type { Activity, ActivityAttachment } from '@/types/database'
import { usePlanStore } from './planStore'

/** El asa de arrastre: misma columna que la casilla de «hecha», para que los trayectos queden alineados. */
function Handle({ title, attributes, listeners }: { title: string } & Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>) {
  return (
    <button
      type="button" {...attributes} {...listeners}
      aria-label={`Mover ${title}`} title="Arrastra para mover"
      className="grid w-9 shrink-0 cursor-grab touch-none place-items-center self-stretch text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
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
  /** Editando: asa de arrastre y menú. Viendo: casilla para marcarla como hecha. */
  editMode: boolean
  currency?: string
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
  onToggleDone: (a: Activity) => void
}

/** Una actividad en el día. Se pulsa entera para abrirla; lo secundario va en el menú «⋯». */
export function ActivityCard({ tripId, activity: a, sortableId, attachments = [], hasAudioguide, editMode, currency, onEdit, onDelete, onToggleDone }: ActivityCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const openPass = useWalletPassStore(s => s.openPass)
  const hovered = usePlanStore(s => s.hoveredActivityId === a.id)
  const setHovered = usePlanStore(s => s.setHoveredActivity)
  const cover = displayCover(a.cover_image_url)
  const where = isMove(a) && (a.origin || a.destination)
    ? `${a.origin ?? ''}${a.origin && a.destination ? ' → ' : ''}${a.destination ?? ''}`
    : a.address

  return (
    <div
      ref={setNodeRef}
      // dnd-kit mueve la tarjeta con transform: es un valor que cambia en cada fotograma.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseEnter={() => setHovered(a.id)}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        'relative flex items-stretch rounded-2xl border bg-card shadow-card transition-[box-shadow,border-color,opacity] duration-150',
        hovered ? 'border-primary/50 shadow-raised' : 'border-border',
        isDragging && 'z-10 opacity-60 shadow-float',
        a.done && !isDragging && 'opacity-60',
      )}
    >
      {editMode
        ? <Handle title={a.title} attributes={attributes} listeners={listeners} />
        : (
          <span className="grid w-11 shrink-0 place-items-center">
            <Checkbox
              round checked={a.done} onCheckedChange={() => onToggleDone(a)}
              aria-label={a.done ? `Marcar ${a.title} como pendiente` : `Marcar ${a.title} como hecha`}
            />
          </span>
        )}

      <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="flex min-w-0 flex-1 items-start gap-3 py-3 pr-1">
        {cover
          ? <img src={cover} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
          : (
            <span data-tone={a.type} className="grid size-16 shrink-0 place-items-center rounded-xl bg-tone-soft text-tone">
              <ActivityIcon type={a.type} className="size-6" />
            </span>
          )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            {(a.start_time || a.end_time) && (
              <span className="flex items-center gap-1 font-semibold tabular-nums">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {a.start_time?.slice(0, 5)}{a.end_time && ` – ${a.end_time.slice(0, 5)}`}
              </span>
            )}
            <span data-tone={a.type} className="font-medium text-tone">{ACTIVITY_LABELS[a.type]}</span>
          </span>
          <span className={cn('mt-0.5 block text-base font-semibold leading-snug line-clamp-2', a.done && 'line-through')}>{a.title}</span>
          {where && (
            <span className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1 break-words">{where}</span>
            </span>
          )}
          {a.description && <span className="mt-1 block text-sm text-muted-foreground line-clamp-2">{a.description}</span>}
          {(hasAudioguide || a.price != null || (a.end_day_id && a.end_day_id !== a.day_id)) && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {a.end_day_id && a.end_day_id !== a.day_id && <Badge tone="primary">{a.type === 'hotel' ? 'Estancia' : 'Llega otro día'}</Badge>}
              {hasAudioguide && <Badge tone="primary" icon={Headphones}>Audioguía</Badge>}
              {a.price != null && <Badge tone="neutral">{formatCurrency(a.price, currency)}</Badge>}
            </span>
          )}
        </span>
      </Link>

      <div className="flex shrink-0 flex-col items-end py-2 pr-2">
        <Menu
          label={`Opciones de ${a.title}`}
          items={[
            a.external_link ? { label: 'Abrir enlace', icon: ExternalLink, onSelect: () => window.open(a.external_link!, '_blank', 'noopener') } : null,
            editMode && { label: 'Editar', icon: Pencil, onSelect: () => onEdit(a) },
            editMode && { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(a) },
          ]}
        />
      </div>

      {/* Entradas y códigos: a un toque, sin abrir la actividad. */}
      {attachments.length > 0 && (
        <div className="absolute -bottom-3 right-3 flex gap-1.5">
          {attachments.slice(0, 2).map(att => (
            <button
              key={att.id} type="button"
              onClick={() => openPass(buildAttachmentPass(att, a))}
              className="inline-flex h-7 max-w-40 items-center gap-1.5 rounded-full border border-border-strong bg-card px-2.5 text-xs font-medium shadow-card hover:bg-secondary"
            >
              <QrCode className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">Mostrar {att.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Dónde duermes ese día: una fila fina que se ordena junto al resto. */
export function LodgingRow({ tripId, lodging: l, sortableId, editMode }: { tripId: string; lodging: Lodging; sortableId: string; editMode: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const role = l.role === 'single' ? '1 noche'
    : l.role === 'out' ? 'Salida'
      : l.role === 'in' ? `Entrada · noche 1 de ${l.nights}`
        : `Noche ${l.night} de ${l.nights}`
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-tone="hotel"
      className={cn('flex min-h-12 items-stretch rounded-2xl border border-tone-line bg-tone-soft', isDragging && 'z-10 opacity-60')}
    >
      {editMode ? <Handle title={l.activity.title} attributes={attributes} listeners={listeners} /> : <span className="w-11 shrink-0" />}
      <Link to={`/trips/${tripId}/itinerary/${l.activity.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-4">
        <BedDouble className="size-5 shrink-0 text-tone" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{l.activity.title}</span>
        <span className="shrink-0 text-sm text-muted-foreground">{role}</span>
      </Link>
    </div>
  )
}
