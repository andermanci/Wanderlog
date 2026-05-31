import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, ExternalLink, Clock, MapPin, Euro } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, ACTIVITY_COLORS, ACTIVITY_LABELS } from '@/lib/utils'
import type { Activity } from '@/types/database'

interface ActivityBlockProps {
  activity: Activity
  onEdit: (a: Activity) => void
  onDelete: (a: Activity) => void
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

export function ActivityBlock({ activity, onEdit, onDelete }: ActivityBlockProps) {
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
    background: '#1a1a26',
    borderLeft: `3px solid ${color}`,
    borderTop: '1px solid #2a2a3a',
    borderRight: '1px solid #2a2a3a',
    borderBottom: '1px solid #2a2a3a',
    borderRadius: '0 0.5rem 0.5rem 0',
  }

  return (
    <div
      ref={setNodeRef}
      style={blockStyle}
      className={cn(
        'group flex gap-3 p-3 transition-colors',
        isDragging ? 'shadow-2xl z-50' : '',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
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
            <p className="font-medium text-sm text-foreground line-clamp-1">{activity.title}</p>

            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {(activity.start_time || activity.end_time) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} />
                  {activity.start_time?.slice(0, 5)}
                  {activity.end_time && ` — ${activity.end_time.slice(0, 5)}`}
                </span>
              )}
              {activity.address && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
                  <MapPin size={10} />
                  {activity.address}
                </span>
              )}
              {activity.price != null && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#c9a84c' }}>
                  <Euro size={10} />
                  {activity.price.toFixed(2)}
                </span>
              )}
            </div>

            {activity.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{activity.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {activity.external_link && (
              <Button size="icon" variant="ghost" className="w-6 h-6" asChild>
                <a href={activity.external_link} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} />
                </a>
              </Button>
            )}
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => onEdit(activity)}>
              <Pencil size={11} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 text-destructive hover:text-destructive"
              onClick={() => onDelete(activity)}
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
