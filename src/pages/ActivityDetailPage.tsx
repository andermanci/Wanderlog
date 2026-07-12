import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Clock, MapPin, Euro, ExternalLink, Pencil, FileText, Navigation,
  Upload, Loader2, X, Calendar, Trash2, Map as MapIcon, Bell,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripHeader } from '@/components/trips/TripHeader'
import { DirectionsDialog } from '@/components/DirectionsDialog'
import type { DirectionsTarget } from '@/lib/directions'
import { useActivities, useItineraryDays, useDeleteActivity } from '@/lib/queries/itinerary'
import { useCreateReminder } from '@/lib/queries/reminders'
import { useTripAttachments, uploadAttachmentFile, useAddAttachment, useDeleteAttachment } from '@/lib/queries/attachments'
import { useAuthStore } from '@/store/authStore'
import { ACTIVITY_COLORS, ACTIVITY_LABELS, formatDate } from '@/lib/utils'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { AudioguideEntryCard } from '@/components/itinerary/AudioguideEntryCard'
import { toast } from 'sonner'

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
  const createReminder = useCreateReminder()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)

  const activity = activities?.find(a => a.id === activityId)
  const day = days?.find(d => d.id === activity?.day_id)
  const endDay = activity?.end_day_id ? days?.find(d => d.id === activity.end_day_id) : null
  const attachments = (tripAttachments ?? []).filter(a => a.activity_id === activityId)

  // Crea un recordatorio relativo a la hora de la actividad (X antes).
  function remindBefore(hoursBefore: number, label: string) {
    if (!activity || !day || !activity.start_time) return
    const base = new Date(`${day.date}T${activity.start_time}`)
    const when = new Date(base.getTime() - hoursBefore * 3600 * 1000)
    if (when.getTime() < Date.now()) { toast.error('Esa hora ya ha pasado'); return }
    createReminder.mutate({
      trip_id: tripId!,
      activity_id: activity.id,
      title: `${activity.title} · ${label}`,
      remind_at: when.toISOString(),
      type: activity.type === 'flight' ? 'flight' : 'custom',
    })
  }

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

  // Navegación secuencial por el itinerario (fecha del día + order_index).
  // Los hoteles quedan fuera: son un banner de estancia, no un paso puntual.
  const dayDate = new Map((days ?? []).map(d => [d.id, d.date]))
  const navigable = (activities ?? [])
    .filter(a => a.type !== 'hotel' && dayDate.has(a.day_id))
    .map(a => ({ a, date: dayDate.get(a.day_id)! }))
    .sort((x, y) => x.date !== y.date ? x.date.localeCompare(y.date) : x.a.order_index - y.a.order_index)
  const navIdx = navigable.findIndex(x => x.a.id === activityId)
  const prevActivity = navIdx > 0 ? navigable[navIdx - 1].a : null
  const nextActivity = navIdx >= 0 && navIdx < navigable.length - 1 ? navigable[navIdx + 1].a : null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Actividad" />

      {/* Cabecera: fila de navegación/acciones y, debajo, el título a todo el ancho */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <BackButton to={`/trips/${tripId}/itinerary${day ? `?day=${day.date}` : ''}`}>Itinerario</BackButton>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to={`/trips/${tripId}/itinerary/${activity.id}/edit`}>
                <Pencil size={13} /> Editar
              </Link>
            </Button>
            <Button
              variant="ghost" size="icon" className="w-9 h-9 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)} aria-label="Eliminar" title="Eliminar"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        <h1 className="font-serif text-2xl sm:text-3xl font-medium flex items-start gap-2.5 break-words leading-tight">
          <span className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `${color}1f` }}>
            <ActivityIcon type={activity.type} size={20} style={{ color }} />
          </span>
          <span className="min-w-0">{activity.title}</span>
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
          {endDay && (
            <span className="flex items-center gap-1 text-xs font-medium capitalize" style={{ color: 'var(--primary)' }}>
              <Calendar size={12} /> {activity.type === 'hotel' ? 'salida' : 'llega'} {formatDate(endDay.date, 'EEE dd MMM')}
            </span>
          )}
          {activity.price != null && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
              <Euro size={12} />{activity.price.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Foto de portada */}
        {activity.cover_image_url && (
          <img
            src={activity.cover_image_url}
            alt={activity.title}
            className="w-full h-48 object-cover rounded-xl border border-border"
            loading="lazy"
          />
        )}

        {/* Transporte: origen → destino + ruta */}
        {isTransport && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={14} style={{ color: 'var(--primary)' }} className="flex-shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">
                {activity.origin || '—'} <span className="text-muted-foreground">→</span> {activity.destination || '—'}
              </span>
            </div>
            {activity.origin && activity.destination && (
              <>
                <iframe
                  aria-label="Ruta" title="Ruta"
                  src={`https://maps.google.com/maps?saddr=${encodeURIComponent(activity.origin)}&daddr=${encodeURIComponent(activity.destination)}&output=embed`}
                  className="w-full h-56 rounded-lg border border-border"
                  loading="lazy"
                />
                <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                  onClick={() => setDirectionsTo({
                    name: activity.destination!,
                    lat: activity.destination_lat, lng: activity.destination_lng,
                    address: activity.destination,
                  })}>
                  <Navigation size={12} /> Cómo llegar
                </Button>
              </>
            )}
          </div>
        )}

        {/* Dirección + mapa */}
        {!isTransport && activity.address && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground min-w-0">
                <MapPin size={13} style={{ color: 'var(--primary)' }} className="flex-shrink-0 mt-0.5" />
                <span className="break-words min-w-0">{activity.address}</span>
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-shrink-0"
                onClick={() => setDirectionsTo({
                  name: activity.title,
                  lat: activity.lat, lng: activity.lng,
                  address: activity.address,
                })}>
                <Navigation size={12} /> <span className="hidden sm:inline">Cómo llegar</span>
              </Button>
            </div>
            <iframe
              aria-label="Mapa" title="Mapa"
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

        {/* Recordarme antes (crea un aviso relativo a la hora de la actividad) */}
        {day && activity.start_time && (
          <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 mb-3">
              <Bell size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-medium">Recordarme antes</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ h: 1, l: '1 h antes' }, { h: 3, l: '3 h antes' }, { h: 24, l: '1 día antes' }].map(({ h, l }) => (
                <Button key={h} size="sm" variant="outline" className="text-xs gap-1.5"
                  disabled={createReminder.isPending}
                  onClick={() => remindBefore(h, l)}>
                  <Bell size={12} /> {l}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Activa las notificaciones en Ajustes para recibirlos.</p>
          </div>
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

        {/* Audioguía generada con Claude + TTS: entrada a su propia página */}
        {(activity.type === 'place' || activity.type === 'activity') && (
          <AudioguideEntryCard activity={activity} tripId={tripId!} />
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
                    aria-label="Eliminar" title="Eliminar"
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

        {/* Navegar a la actividad anterior/siguiente del itinerario */}
        {(prevActivity || nextActivity) && (
          <div className="flex gap-2">
            {prevActivity ? (
              <Button variant="outline" className="flex-1 min-w-0 h-auto py-2.5 justify-start gap-1.5" asChild>
                <Link to={`/trips/${tripId}/itinerary/${prevActivity.id}`}>
                  <ChevronLeft size={15} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                  <span className="min-w-0 text-left">
                    <span className="block text-[10px] text-muted-foreground">Anterior</span>
                    <span className="block text-sm font-medium truncate">{prevActivity.title}</span>
                  </span>
                </Link>
              </Button>
            ) : <div className="flex-1" />}
            {nextActivity ? (
              <Button variant="outline" className="flex-1 min-w-0 h-auto py-2.5 justify-end gap-1.5" asChild>
                <Link to={`/trips/${tripId}/itinerary/${nextActivity.id}`}>
                  <span className="min-w-0 text-right">
                    <span className="block text-[10px] text-muted-foreground">Siguiente</span>
                    <span className="block text-sm font-medium truncate">{nextActivity.title}</span>
                  </span>
                  <ChevronRight size={15} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                </Link>
              </Button>
            ) : <div className="flex-1" />}
          </div>
        )}
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

      <DirectionsDialog target={directionsTo} onClose={() => setDirectionsTo(null)} />
    </div>
  )
}
