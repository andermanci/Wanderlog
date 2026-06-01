import { Clock, MapPin, Euro, ExternalLink, Pencil, FileText, Navigation } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ACTIVITY_COLORS, ACTIVITY_LABELS } from '@/lib/utils'
import type { Activity, ActivityAttachment } from '@/types/database'

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', restaurant: '🍽️', activity: '🎯',
  transport: '🚌', place: '📍', other: '📌',
}

interface ActivityDetailDialogProps {
  open: boolean
  onClose: () => void
  activity: Activity | null
  attachments?: ActivityAttachment[]
  onEdit?: (a: Activity) => void
}

export function ActivityDetailDialog({ open, onClose, activity, attachments = [], onEdit }: ActivityDetailDialogProps) {
  if (!activity) return null
  const color = ACTIVITY_COLORS[activity.type]
  const mapsQuery = activity.address ? encodeURIComponent(activity.address) : null
  const isTransport = activity.type === 'transport' && (activity.origin || activity.destination)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="text-xl">{TYPE_ICONS[activity.type]}</span>
            <span className="font-serif text-xl">{activity.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${color}18`, color }}>
              {ACTIVITY_LABELS[activity.type]}
            </span>
            {(activity.start_time || activity.end_time) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={12} />
                {activity.start_time?.slice(0, 5)}{activity.end_time && ` — ${activity.end_time.slice(0, 5)}`}
              </span>
            )}
            {activity.price != null && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                <Euro size={12} />{activity.price.toFixed(2)}
              </span>
            )}
          </div>

          {/* Transporte: origen → destino + mapa de ruta */}
          {isTransport && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} style={{ color: 'var(--primary)' }} />
                <span>{activity.origin || '—'}</span>
                <span className="text-muted-foreground">→</span>
                <span>{activity.destination || '—'}</span>
              </div>
              {activity.origin && activity.destination && (
                <>
                  <iframe
                    title="Ruta"
                    src={`https://maps.google.com/maps?saddr=${encodeURIComponent(activity.origin)}&daddr=${encodeURIComponent(activity.destination)}&output=embed`}
                    className="w-full h-48 rounded-lg border border-border"
                    loading="lazy"
                  />
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
                    <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(activity.origin)}&destination=${encodeURIComponent(activity.destination)}`} target="_blank" rel="noreferrer">
                      <Navigation size={12} /> Cómo llegar
                    </a>
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Dirección + mapa */}
          {!isTransport && activity.address && (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin size={13} style={{ color: 'var(--primary)' }} />
                  {activity.address}
                </p>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-shrink-0" asChild>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer">
                    <Navigation size={12} /> Cómo llegar
                  </a>
                </Button>
              </div>
              <iframe
                title="Mapa"
                src={`https://maps.google.com/maps?q=${mapsQuery}&z=14&output=embed`}
                className="w-full h-48 rounded-lg border border-border"
                loading="lazy"
              />
            </div>
          )}

          {/* Descripción */}
          {activity.description && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Descripción</p>
              <p className="text-sm whitespace-pre-line">{activity.description}</p>
            </div>
          )}

          {/* Notas */}
          {activity.notes && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Notas</p>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{activity.notes}</p>
            </div>
          )}

          {/* Enlace externo */}
          {activity.external_link && (
            <a href={activity.external_link} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--primary)' }}>
              <ExternalLink size={13} /> Abrir enlace
            </a>
          )}

          {/* Adjuntos */}
          {attachments.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Entradas y documentos</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map(att => {
                  const isImg = att.mime?.startsWith('image/') ?? /\.(png|jpe?g|webp)$/i.test(att.file_url)
                  return (
                    <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer" title={att.name}
                      className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg border border-border hover:border-primary transition-colors"
                      style={{ background: 'var(--secondary)' }}>
                      {isImg ? (
                        <img src={att.file_url} alt={att.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--card)' }}>
                          <FileText size={14} style={{ color: 'var(--primary)' }} />
                        </span>
                      )}
                      <span className="text-xs truncate max-w-[160px]">{att.name}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {onEdit && (
            <div className="flex justify-end pt-1">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { onEdit(activity); onClose() }}>
                <Pencil size={13} /> Editar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
