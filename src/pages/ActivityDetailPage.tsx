import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Clock, MapPin, Euro, ExternalLink, Pencil, FileText, Navigation,
  ArrowLeft, Upload, Loader2, X, Calendar, Trash2, Map as MapIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripHeader } from '@/components/trips/TripHeader'
import { useActivities, useItineraryDays, useDeleteActivity } from '@/lib/queries/itinerary'
import { useTripAttachments, uploadAttachmentFile, useAddAttachment, useDeleteAttachment } from '@/lib/queries/attachments'
import { useAuthStore } from '@/store/authStore'
import { ACTIVITY_COLORS, ACTIVITY_LABELS, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', restaurant: '🍽️', activity: '🎯',
  transport: '🚌', place: '📍', other: '📌',
}

// Página de detalle de actividad (antes un modal): enlazable, con botón
// atrás natural en móvil, mapa y wallet de entradas con subida directa.
export function ActivityDetailPage() {
  const { tripId, activityId } = useParams<{ tripId: string; activityId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: activities, isLoading } = useActivities(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: tripAttachments } = useTripAttachments(tripId!)
  const addAttachment = useAddAttachment(tripId!, activityId!)
  const deleteAttachment = useDeleteAttachment(tripId!)
  const deleteActivity = useDeleteActivity()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const activity = activities?.find(a => a.id === activityId)
  const day = days?.find(d => d.id === activity?.day_id)
  const attachments = (tripAttachments ?? []).filter(a => a.activity_id === activityId)

  async function handleUpload(file: File) {
    if (!user || !activityId) return
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo supera 10 MB'); return }
    setUploading(true)
    try {
      const url = await uploadAttachmentFile(file, user.id, tripId!, activityId)
      await addAttachment.mutateAsync({ name: file.name, file_url: url, mime: file.type || null })
    } catch {
      toast.error('No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Skeleton className="h-10 w-2/3" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-48 w-full" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <TripHeader tripId={tripId!} section="Actividad" />
        <p className="text-muted-foreground py-12 text-center">Actividad no encontrada.</p>
      </div>
    )
  }

  const color = ACTIVITY_COLORS[activity.type]
  const isTransport = activity.type === 'transport' && (activity.origin || activity.destination)
  const mapsQuery = activity.address ? encodeURIComponent(activity.address) : null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Actividad" />

      {/* Cabecera */}
      <div className="flex items-start gap-3 mb-6">
        <Button variant="ghost" size="icon" className="w-8 h-8 mt-1" asChild>
          <Link to={`/trips/${tripId}/itinerary`}><ArrowLeft size={16} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-3xl font-medium flex items-center gap-2">
            <span className="text-2xl">{TYPE_ICONS[activity.type]}</span>
            {activity.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${color}18`, color }}>
              {ACTIVITY_LABELS[activity.type]}
            </span>
            {day && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground capitalize">
                <Calendar size={12} />
                {formatDate(day.date, 'EEEE dd MMM')}
              </span>
            )}
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
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to={`/trips/${tripId}/itinerary/${activity.id}/edit`}><Pencil size={13} /> Editar</Link>
          </Button>
          <Button
            variant="ghost" size="icon" className="w-9 h-9 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)} title="Eliminar"
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Transporte: origen → destino + ruta */}
        {isTransport && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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
                  className="w-full h-56 rounded-lg border border-border"
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
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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
              src={activity.lat != null && activity.lng != null
                ? `https://maps.google.com/maps?q=${activity.lat},${activity.lng}&z=15&output=embed`
                : `https://maps.google.com/maps?q=${mapsQuery}&z=14&output=embed`}
              className="w-full h-56 rounded-lg border border-border"
              loading="lazy"
            />
          </div>
        )}

        {/* Ver esta actividad en el mapa del viaje */}
        {(activity.address || activity.origin || activity.destination) && (
          <Button variant="outline" className="w-full gap-1.5" asChild>
            <Link to={`/trips/${tripId}/map?focus=${activity.id}`}>
              <MapIcon size={15} /> Ver en el mapa del viaje
            </Link>
          </Button>
        )}

        {/* Descripción / notas / enlace */}
        {(activity.description || activity.notes || activity.external_link) && (
          <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            {activity.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Descripción</p>
                <p className="text-sm whitespace-pre-line">{activity.description}</p>
              </div>
            )}
            {activity.notes && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Notas</p>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{activity.notes}</p>
              </div>
            )}
            {activity.external_link && (
              <a href={activity.external_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--primary)' }}>
                <ExternalLink size={13} /> Abrir enlace
              </a>
            )}
          </div>
        )}

        {/* Wallet: entradas y documentos, con subida directa */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Entradas y documentos</p>
          <div className="flex flex-wrap gap-2">
            {attachments.map(att => {
              const isImg = att.mime?.startsWith('image/') ?? /\.(png|jpe?g|webp)$/i.test(att.file_url)
              return (
                <div key={att.id} className="relative">
                  <a href={att.file_url} target="_blank" rel="noreferrer" title={att.name}
                    className="block w-24 h-24 rounded-lg overflow-hidden border border-border">
                    {isImg ? (
                      <img src={att.file_url} alt={att.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1" style={{ background: 'var(--secondary)' }}>
                        <FileText size={22} style={{ color: 'var(--primary)' }} />
                        <span className="text-[9px] text-muted-foreground line-clamp-2 text-center">{att.name}</span>
                      </div>
                    )}
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteAttachment.mutate(att.id)}
                    title="Eliminar"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-destructive hover:bg-destructive hover:text-white shadow transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-24 h-24 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <span className="text-[10px]">{uploading ? 'Subiendo' : 'Añadir'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{activity.title}</strong> y sus adjuntos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                deleteActivity.mutate({ id: activity.id, tripId: tripId! })
                navigate(`/trips/${tripId}/itinerary`, { replace: true })
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
