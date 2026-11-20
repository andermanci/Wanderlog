import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Eye, Map as MapIcon, MapPin, Navigation,
  QrCode, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ActivityIcon, Button, DocIcon, Row, RowList, useIsMobile, type Tone, Photo } from '@/design'
import { FlightStatusCard } from '@/features/common/FlightStatusCard'
import { activityTarget } from '@/features/common/target'
import { AudioguideEntryCard } from '@/features/guide/AudioguideEntryCard'
import { usePlanStore } from '@/features/plan/planStore'
import { ActivityAttachments } from '@/features/wallet/ActivityAttachments'
import { FileViewer } from '@/features/wallet/FileViewer'
import type { FileRef } from '@/features/wallet/shared'
import { navAppsFor } from '@/lib/directions'
import { displayCover, useSetActivityDone } from '@/lib/queries/itinerary'
import { useCreateReminder } from '@/lib/queries/reminders'
import { useTrip } from '@/lib/queries/trips'
import { isMove } from '@/lib/travelTime'
import { ACTIVITY_LABELS, DOCUMENT_LABELS, formatCurrency, formatDate } from '@/lib/utils'
import { buildDocPass } from '@/lib/wallet/pass'
import { useWalletPassStore } from '@/store/walletPassStore'
import type { Activity, Document, ItineraryDay } from '@/types/database'
import { FlightTimes } from './FlightTimes'

const REMINDERS = [
  { hours: 1, label: '1 h antes' },
  { hours: 3, label: '3 h antes' },
  { hours: 24, label: '1 día antes' },
]

/** Cuándo avisar: X horas antes de la actividad. null si ese momento ya ha pasado. */
function reminderTime(date: string, startTime: string, hoursBefore: number): Date | null {
  const base = new Date(`${date}T${startTime}`)
  const when = new Date(base.getTime() - hoursBefore * 3600 * 1000)
  return when.getTime() < Date.now() ? null : when
}

interface ActivityDetailProps {
  tripId: string
  activity: Activity
  days: ItineraryDay[]
  activities: Activity[]
  /** Reserva (documento) vinculada a esta actividad, si la hay. */
  linkedDoc: Document | null
  canEdit: boolean
  /** Paso «cómo llegar» abierto (lo gobierna el panel, que pinta su título y su «atrás»). */
  directions: boolean
  onDirections: (open: boolean) => void
  /** Cierra el panel y vuelve al Plan. */
  onClose: () => void
}

/** El contenido del panel al ver una actividad. */
export function ActivityDetail({
  tripId, activity, days, activities, linkedDoc, canEdit, directions, onDirections, onClose,
}: ActivityDetailProps) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: trip } = useTrip(tripId)
  const setDone = useSetActivityDone()
  const createReminder = useCreateReminder()
  const openPass = useWalletPassStore(s => s.openPass)
  // El archivo se conserva al cerrar el visor para que no se vacíe mientras se va.
  const [file, setFile] = useState<FileRef | null>(null)
  const [fileOpen, setFileOpen] = useState(false)
  const view = (f: FileRef) => { setFile(f); setFileOpen(true) }

  const day = days.find(d => d.id === activity.day_id)
  const endDay = activity.end_day_id ? days.find(d => d.id === activity.end_day_id) : null
  const dayDate = new Map(days.map(d => [d.id, d.date]))
  const move = isMove(activity)
  const isTransport = move && (activity.origin || activity.destination)
  const hasPlace = !!(activity.address || activity.origin || activity.destination)
  const target = activityTarget(activity)
  const apps = target ? navAppsFor(target) : []
  const cover = displayCover(activity.cover_image_url)
  const linkedDocPass = linkedDoc ? buildDocPass(linkedDoc) : null
  const tone = activity.type as Tone

  // Crea un aviso relativo a la hora de la actividad (X antes).
  function remindBefore(hoursBefore: number, label: string) {
    if (!day || !activity.start_time) return
    const when = reminderTime(day.date, activity.start_time, hoursBefore)
    if (!when) { toast.error('Esa hora ya ha pasado.'); return }
    createReminder.mutate({
      trip_id: tripId,
      activity_id: activity.id,
      title: `${activity.title} · ${label}`,
      remind_at: when.toISOString(),
      type: activity.type === 'flight' ? 'flight' : 'custom',
    })
  }

  function showOnMap() {
    usePlanStore.getState().focusOnMap({ kind: 'activity', id: activity.id })
    // En el móvil el mapa es otra vista del Plan; en escritorio ya está al lado
    // y basta con quitar el panel de encima.
    if (isMobile) navigate(`/trips/${tripId}/itinerary?vista=mapa`)
    else onClose()
  }

  // Paso «cómo llegar»: elegir con qué app de mapas ir.
  if (directions) {
    return (
      <>
        <RowList>
          {apps.map(app => (
            <a
              key={app.name} href={app.href} target="_blank" rel="noreferrer"
              onClick={() => onDirections(false)}
              className="block transition-colors hover:bg-secondary/70"
            >
              <Row icon={Navigation} tone="info" title={app.name} trailing={<ExternalLink className="size-4" aria-hidden="true" />} />
            </a>
          ))}
        </RowList>
        <p className="mt-3 text-sm text-muted-foreground">Se abre la app si la tienes instalada; si no, en el navegador.</p>
      </>
    )
  }

  // Anterior y siguiente, en el orden del plan (fecha del día + posición).
  // Los hoteles quedan fuera: son una estancia, no un paso del día.
  const navigable = activities
    .filter(a => a.type !== 'hotel' && dayDate.has(a.day_id))
    .map(a => ({ a, date: dayDate.get(a.day_id)! }))
    .sort((x, y) => x.date !== y.date ? x.date.localeCompare(y.date) : x.a.order_index - y.a.order_index)
  const navIdx = navigable.findIndex(x => x.a.id === activity.id)
  const prev = navIdx > 0 ? navigable[navIdx - 1].a : null
  const next = navIdx >= 0 && navIdx < navigable.length - 1 ? navigable[navIdx + 1].a : null

  // Las horas de un vuelo o transporte con salida y llegada las pinta FlightTimes.
  const timesInCard = move && !!activity.start_time && !!activity.end_time
  const showTimes = !timesInCard && !!(activity.start_time || activity.end_time)

  return (
    <div className="space-y-6" data-tone={tone}>
      {/* Portada a sangre: la foto si la hay; si no, nada (el color ya lo pone el rótulo). */}
      <Photo src={cover} alt="" className="-mx-5 -mt-1 h-52 w-[calc(100%+2.5rem)] max-w-none object-cover md:-mx-7 md:h-60 md:w-[calc(100%+3.5rem)]" loading="lazy" />

      {/* Qué es y cuándo: la hora, grande, es lo primero que se busca. */}
      <div>
        <p className="eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5 text-tone"><ActivityIcon type={activity.type} className="size-3.5" /> {ACTIVITY_LABELS[activity.type]}</span>
          {day && <span>· {formatDate(day.date, "EEEE d 'de' MMMM")}</span>}
        </p>
        {showTimes && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 font-serif text-4xl font-medium leading-none tracking-tight tabular-nums md:text-5xl">
            {activity.start_time?.slice(0, 5)}
            {activity.start_time && activity.end_time && <span className="text-2xl text-muted-foreground/60" aria-label="hasta">→</span>}
            {activity.end_time && <span className={activity.start_time ? 'text-muted-foreground' : undefined}>{activity.end_time.slice(0, 5)}</span>}
          </p>
        )}
        {(endDay || activity.price != null) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {endDay && (
              <span className="flex items-center gap-1.5 font-medium text-accent-foreground">
                <CalendarDays className="size-4" aria-hidden="true" />
                {activity.type === 'hotel' ? 'Salida el' : move ? 'Llega el' : 'Termina el'} {formatDate(endDay.date, 'EEE d MMM')}
              </span>
            )}
            {activity.price != null && (
              <span className="font-semibold tabular-nums">
                {trip ? formatCurrency(activity.price, trip.default_currency ?? undefined) : activity.price.toFixed(2)}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Horas del billete, con la duración REAL si cruza husos horarios */}
      {move && (
        <FlightTimes
          activity={activity}
          startDate={day?.date ?? ''}
          endDate={activity.end_day_id ? dayDate.get(activity.end_day_id) : null}
        />
      )}

      {/* Dónde y las dos cosas que se hacen con un sitio: ir y verlo en el mapa. */}
      {(hasPlace || target) && (
        <div className="space-y-3 border-t border-border pt-5">
          {hasPlace && (
            <p className="flex items-start gap-2.5 text-base">
              <MapPin className="mt-0.5 size-5 shrink-0 text-tone" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {isTransport
                  ? <>{activity.origin || '—'} <span className="text-muted-foreground" aria-label="hasta">→</span> {activity.destination || '—'}</>
                  : activity.address}
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-2 [&>*]:flex-1">
            {apps.length > 0 && (
              <Button variant="primary" onClick={() => onDirections(true)}>
                <Navigation /> Cómo llegar
              </Button>
            )}
            {hasPlace && (
              <Button variant="outline" onClick={showOnMap}>
                <MapIcon /> Ver en el mapa
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Hecha: también la marca quien solo puede ver el viaje */}
      <button
        type="button" aria-pressed={activity.done}
        onClick={() => setDone.mutate({ id: activity.id, done: !activity.done, tripId })}
        data-tone={activity.done ? 'success' : 'neutral'}
        className="flex min-h-13 w-full items-center gap-3 rounded-full border border-tone-line bg-tone-soft px-4 text-left text-[0.9375rem] font-medium transition-colors"
      >
        <span className={activity.done ? 'grid size-7 place-items-center rounded-full bg-tone text-white dark:text-background' : 'size-7 rounded-full border-2 border-border-strong bg-card'}>
          {activity.done && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
        </span>
        {activity.done ? 'Hecha' : 'Marcar como hecha'}
      </button>

      {/* Audioguía: su pantalla propia; aquí solo la entrada */}
      {(activity.type === 'place' || activity.type === 'activity') && (
        <AudioguideEntryCard activity={activity} tripId={tripId} canEdit={canEdit} />
      )}

      {/* Estado real del vuelo. Solo se pinta si la reserva trae número y
          estamos en los días del vuelo; si no, no ocupa sitio. */}
      <FlightStatusCard
        flightNumber={linkedDoc?.flight_number}
        date={day?.date ?? linkedDoc?.datetime_start?.slice(0, 10)}
      />

      {/* Reserva vinculada: localizador, compañía, asiento, código y billete */}
      {linkedDoc && (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5 shadow-card before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-tone space-y-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-tone"><DocIcon category={linkedDoc.category} className="size-3.5" /> Reserva</p>
            <p className="mt-0.5 truncate font-serif text-lg font-medium">
              {linkedDoc.provider || DOCUMENT_LABELS[linkedDoc.category] || linkedDoc.title}
            </p>
          </div>
          {(linkedDoc.flight_number || linkedDoc.locator || linkedDoc.confirmation_number || linkedDoc.seat) && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-dashed border-border-strong pt-3">
              {linkedDoc.flight_number && <DocFact label="Vuelo" mono>{linkedDoc.flight_number}</DocFact>}
              {linkedDoc.locator && <DocFact label="Localizador" mono>{linkedDoc.locator}</DocFact>}
              {linkedDoc.confirmation_number && <DocFact label="Confirmación" mono>{linkedDoc.confirmation_number}</DocFact>}
              {linkedDoc.seat && <DocFact label="Asiento">{linkedDoc.seat}</DocFact>}
            </dl>
          )}
          <div className="flex flex-wrap gap-2">
            {linkedDocPass && (
              <Button variant="secondary" size="sm" onClick={() => openPass(linkedDocPass)}>
                <QrCode /> Mostrar código
              </Button>
            )}
            {linkedDoc.file_url && (
              <Button variant="outline" size="sm" onClick={() => view({ url: linkedDoc.file_url!, name: linkedDoc.title })}>
                <Eye /> Ver billete
              </Button>
            )}
            {linkedDoc.back_url && (
              <Button variant="outline" size="sm" onClick={() => view({ url: linkedDoc.back_url!, name: `${linkedDoc.title} (2)` })}>
                <Eye /> Ver segundo archivo
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to={`/trips/${tripId}/documents?doc=${linkedDoc.id}`}><Wallet /> Ver en Cartera</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Descripción, notas y enlace */}
      {(activity.description || activity.notes || activity.external_link) && (
        <div className="space-y-4">
          {activity.description && (
            <div>
              <p className="eyebrow mb-1">Descripción</p>
              <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed">{activity.description}</p>
            </div>
          )}
          {activity.notes && (
            <div>
              <p className="eyebrow mb-1">Notas</p>
              <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-muted-foreground">{activity.notes}</p>
            </div>
          )}
          {activity.external_link && (
            <Button asChild variant="outline" size="sm">
              <a href={activity.external_link} target="_blank" rel="noreferrer"><ExternalLink /> Abrir enlace</a>
            </Button>
          )}
        </div>
      )}

      {/* Entradas y archivos de la actividad */}
      <ActivityAttachments tripId={tripId} activityId={activity.id} canEdit={canEdit} />

      {/* Recordarme antes: crea un aviso relativo a la hora de la actividad */}
      {day && activity.start_time && (
        <div className="space-y-2.5 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <Bell className="size-[1.125rem] text-muted-foreground" aria-hidden="true" /> Recordarme antes
          </p>
          <div className="flex flex-wrap gap-2">
            {REMINDERS.map(r => (
              <Button
                key={r.hours} variant="outline" size="sm"
                disabled={createReminder.isPending}
                onClick={() => remindBefore(r.hours, r.label)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Para que te llegue el aviso, activa las notificaciones en Ajustes.</p>
        </div>
      )}

      {/* Anterior y siguiente del plan */}
      {(prev || next) && (
        <nav aria-label="Otras actividades del plan" className="grid grid-cols-2 gap-2 border-t border-border pt-5">
          {prev ? <Sibling to={`/trips/${tripId}/itinerary/${prev.id}`} activity={prev} dir="prev" /> : <span />}
          {next ? <Sibling to={`/trips/${tripId}/itinerary/${next.id}`} activity={next} dir="next" /> : <span />}
        </nav>
      )}

      <FileViewer open={fileOpen} file={file} onClose={() => setFileOpen(false)} />
    </div>
  )
}

function DocFact({ label, mono, children }: { label: string; mono?: boolean; children: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-[0.9375rem] font-semibold tracking-wide' : 'break-words text-[0.9375rem]'}>{children}</dd>
    </div>
  )
}

function Sibling({ to, activity, dir }: { to: string; activity: Activity; dir: 'prev' | 'next' }) {
  const next = dir === 'next'
  return (
    <Link
      to={to}
      className={`flex min-h-15 min-w-0 items-center gap-2 rounded-xl border border-border-strong bg-card px-3 py-2 transition-colors hover:bg-secondary ${next ? 'justify-end text-right' : ''}`}
    >
      {!next && <ChevronLeft className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{next ? 'Siguiente' : 'Anterior'}</span>
        <span className="block truncate text-sm font-medium">{activity.title}</span>
      </span>
      {next && <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </Link>
  )
}
