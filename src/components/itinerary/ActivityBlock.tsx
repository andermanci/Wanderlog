import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, ExternalLink, Clock, MapPin, Euro, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, ACTIVITY_COLORS, ACTIVITY_LABELS } from '@/lib/utils'
import type { Activity, ActivityAttachment } from '@/types/database'

interface ActivityBlockProps {
  activity: Activity
  attachments?: ActivityAttachment[]
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
  onOpen?: (a: Activity) => void
}

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍽️',
  activity: '🎯',
  transport: '🚌',
  place: '📍',
  other: '📌',
}

export function ActivityBlock({ activity, attachments = [], onEdit, onDelete, onOpen }: ActivityBlockProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: activity.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const color = ACTIVITY_COLORS[activity.type]

  const blockStyle = {
    ...style,
    background: 'var(--secondary)',
    borderLeft: `3px solid ${color}`,
    borderTop: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    borderRadius: '0 0.5rem 0.5rem 0',
  }

  return (
    <div
      ref={setNodeRef}
      style={blockStyle}
      onClick={() => onOpen?.(activity)}
      className={cn(
        'group flex gap-3 p-3 transition-all cursor-pointer hover:brightness-[1.03] hover:shadow-md',
        isDragging ? 'shadow-2xl z-50' : '',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing mt-0.5"
      >
        <GripVertical size={14} />
      </button>

      {/* Icon */}
      <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[activity.type]}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {activity.title}
            </p>

            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {(activity.start_time || activity.end_time) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} />
                  {activity.start_time?.slice(0, 5)}
                  {activity.end_time && ` — ${activity.end_time.slice(0, 5)}`}
                </span>
              )}
              {activity.type === 'transport' && (activity.origin || activity.destination) ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[220px]">
                  <MapPin size={10} />
                  {activity.origin}{activity.origin && activity.destination ? ' → ' : ''}{activity.destination}
                </span>
              ) : activity.address && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
                  <MapPin size={10} />
                  {activity.address}
                </span>
              )}
              {activity.price != null && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                  <Euro size={10} />
                  {activity.price.toFixed(2)}
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
          <div className="flex gap-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">
            {activity.external_link && (
              <Button size="icon" variant="ghost" className="w-6 h-6" asChild>
                <a href={activity.external_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink size={11} />
                </a>
              </Button>
            )}
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={(e) => { e.stopPropagation(); onEdit(activity) }}>
              <Pencil size={11} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(activity) }}
            >
              <Trash2 size={11} />
            </Button>
          </div>
        </div>

        {/* Type badge */}
        <span
          className="inline-block text-xs px-1.5 py-0.5 rounded mt-1"
          style={{ background: `${color}18`, color }}
        >
          {ACTIVITY_LABELS[activity.type]}
        </span>
      </div>
    </div>
  )
}
