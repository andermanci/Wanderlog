import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, ExternalLink, Clock, MapPin, Euro, FileText, Headphones } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { cn, ACTIVITY_COLORS, ACTIVITY_LABELS } from '@/lib/utils'
import type { Activity, ActivityAttachment } from '@/types/database'

interface ActivityBlockProps {
  activity: Activity
  attachments?: ActivityAttachment[]
  /** Ya tiene una audioguía generada (con todas sus paradas listas). */
  hasAudioguide?: boolean
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
  onOpen?: (a: Activity) => void
  /** Id de arrastre con ámbito por día ("activityId::dayId"). */
  sortableId?: string
  /** Modo edición: muestra asa de arrastre y acciones editar/borrar. */
  editMode?: boolean
  /** Modo ver: marca/desmarca la actividad como hecha. */
  onToggleDone?: (a: Activity) => void
}

export function ActivityBlock({ activity, attachments = [], hasAudioguide, onEdit, onDelete, onOpen, sortableId, editMode = true, onToggleDone }: ActivityBlockProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: sortableId ?? activity.id })

  const color = ACTIVITY_COLORS[activity.type]
  const done = activity.done

  const blockStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : done ? 0.6 : 1,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  }

  return (
    <div
      ref={setNodeRef}
      style={blockStyle}
      onClick={() => onOpen?.(activity)}
      className={cn(
        'group flex gap-3 p-3 transition-all cursor-pointer hover:border-primary hover:shadow-md',
        isDragging ? 'shadow-2xl z-50' : '',
      )}
    >
      {/* Izquierda: asa de arrastre (Editar) o checkbox de "hecha" (Ver) */}
      {editMode ? (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Reordenar ${activity.title}`}
          className="flex-shrink-0 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      ) : (
        <span className="flex-shrink-0 w-8 flex items-center justify-center mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={done}
            onCheckedChange={() => onToggleDone?.(activity)}
            aria-label={done ? `Marcar ${activity.title} como pendiente` : `Marcar ${activity.title} como hecha`}
          />
        </span>
      )}

      {/* Media box: mismo tamaño siempre (foto o icono del tipo), para que todas
          las filas tengan la misma estética y el texto quede alineado. */}
      {activity.cover_image_url ? (
        <img
          src={activity.cover_image_url}
          alt=""
          className="flex-shrink-0 w-11 h-11 rounded-lg object-cover border border-border"
          loading="lazy"
        />
      ) : (
        <span className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <ActivityIcon type={activity.type} size={19} style={{ color }} aria-hidden="true" />
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={cn(
              'font-medium text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors',
              done && 'line-through',
            )}>
              {activity.title}
            </p>

            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none"
                style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
              >
                {ACTIVITY_LABELS[activity.type]}
              </span>
              {(activity.start_time || activity.end_time) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} />
                  {activity.start_time?.slice(0, 5)}
                  {activity.end_time && ` — ${activity.end_time.slice(0, 5)}`}
                </span>
              )}
              {activity.end_day_id && activity.end_day_id !== activity.day_id && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
                  {activity.type === 'hotel' ? 'estancia' : 'llega otro día'}
                </span>
              )}
              {activity.type === 'transport' && (activity.origin || activity.destination) ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  <MapPin size={10} className="flex-shrink-0" />
                  <span className="break-words">{activity.origin}{activity.origin && activity.destination ? ' → ' : ''}{activity.destination}</span>
                </span>
              ) : activity.address && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  <MapPin size={10} className="flex-shrink-0" />
                  <span className="break-words">{activity.address}</span>
                </span>
              )}
              {activity.price != null && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                  <Euro size={10} />
                  {activity.price.toFixed(2)}
                </span>
              )}
              {hasAudioguide && (
                <span
                  title="Audioguía disponible"
                  className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none"
                  style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                >
                  <Headphones size={10} /> Audioguía
                </span>
              )}
            </div>

            {activity.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{activity.description}</p>
            )}

            {/* Adjuntos (entradas, QRs) */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attachments.map(att => {
                  const isImg = att.mime?.startsWith('image/') ?? /\.(png|jpe?g|webp)$/i.test(att.file_url)
                  return (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noreferrer"
                      title={att.name}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-md border border-border flex-shrink-0 hover:border-primary transition-colors"
                      style={{ background: 'var(--card)' }}
                    >
                      {isImg ? (
                        <img src={att.file_url} alt={att.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                      ) : (
                        <FileText size={13} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
                      )}
                      <span className="text-xs truncate max-w-[140px]">{att.name}</span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {activity.external_link && (
              <Button size="icon" variant="ghost" className="w-8 h-8" asChild>
                <a href={activity.external_link} target="_blank" rel="noreferrer" aria-label="Abrir enlace" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </Button>
            )}
            {editMode && (
              <>
                <Button size="icon" variant="ghost" className="w-8 h-8" aria-label={`Editar ${activity.title}`} onClick={(e) => { e.stopPropagation(); onEdit(activity) }}>
                  <Pencil size={14} aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 text-destructive hover:text-destructive"
                  aria-label={`Eliminar ${activity.title}`}
                  onClick={(e) => { e.stopPropagation(); onDelete(activity) }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
