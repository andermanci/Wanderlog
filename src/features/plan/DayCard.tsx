import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BookHeart, ChevronDown, CornerDownRight, Headphones, Plus, TrainFront } from 'lucide-react'
import { Badge, Button, IconButton } from '@/design'
import { cn } from '@/lib/utils'
import { weatherIcon, type DayWeather } from '@/lib/queries/weather'
import { useSetActivityDone, useUpdateDayCities } from '@/lib/queries/itinerary'
import { formatDayTotal, pairKey } from '@/lib/travelTime'
import { dayCities, resolveNames } from '@/lib/cities'
import { dayOrderOf, type Lodging } from '@/lib/lodging'
import type { Activity, DestinationGuide, ItineraryDay } from '@/types/database'
import { TravelConnector } from './transit/TravelConnector'
import { ActivityCard, LodgingRow } from './ActivityCard'
import { DayAlerts } from './DayAlerts'
import { ConflictBadge, DayCities, DayConflicts, DayDriftNote } from './DayBits'
import type { PlanData } from './usePlanData'

interface DayCardProps {
  tripId: string
  day: ItineraryDay
  index: number
  plan: PlanData
  guides: DestinationGuide[] | undefined
  weather: DayWeather | undefined
  hasJournal: boolean
  onJournal: (day: ItineraryDay) => void
  onDelete: (a: Activity) => void
}

// Zona soltable del día: permite soltar una actividad aunque el día esté vacío.
function Droppable({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('rounded-2xl transition-shadow', isOver && 'ring-2 ring-primary/50 ring-offset-4 ring-offset-background')}>
      {children}
    </div>
  )
}

/** Un día del plan: cabecera con lo que se puede hacer ese día (con texto), y debajo su línea de tiempo. */
export function DayCard({ tripId, day, index, plan, guides, weather, hasJournal, onJournal, onDelete }: DayCardProps) {
  const navigate = useNavigate()
  const updateDayCities = useUpdateDayCities()
  const setActivityDone = useSetActivityDone()
  const { editMode, canEdit, legs, travelTimes, legSeverity, setTransitScope } = plan

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const isToday = day.date === todayStr
  const isPast = day.date < todayStr
  const date = parseISO(day.date)
  const collapsed = plan.collapsedDays.has(day.id)

  const dayActs = (plan.activitiesByDay.get(day.id) ?? []).filter(a => a.type !== 'hotel')
  const arrivals = plan.arrivalsByDay.get(day.id) ?? []
  const lodging = plan.lodgingByDay.get(day.id) ?? []
  const conflicts = plan.conflictsByDay.get(day.id) ?? []
  const dt = plan.transitByDay.get(day.id)
  // Los hoteles se ordenan junto al resto: lista combinada por order_index.
  const items = [
    ...dayActs.map(a => ({ id: a.id, order: a.order_index, act: a as Activity | null, lodge: null as Lodging | null })),
    ...lodging.map(l => ({ id: l.activity.id, order: dayOrderOf(l.activity, day.id), act: null as Activity | null, lodge: l as Lodging | null })),
  ].sort((x, y) => x.order - y.order)
  const titleOf = (it: typeof items[number]) => it.act?.title ?? it.lodge?.activity.title

  const morningHotel = plan.morningHotelFor(day.id)
  const morningKey = morningHotel && items[0] ? pairKey(morningHotel.id, items[0].id) : null
  // Suma de los trayectos ya resueltos (los que faltan simplemente no cuentan).
  const travelSeconds = items.slice(0, -1).reduce((sum, it, i) => {
    const leg = legs.get(pairKey(it.id, items[i + 1].id))
    return leg ? sum + leg.durationSeconds : sum
  }, morningKey ? legs.get(morningKey)?.durationSeconds ?? 0 : 0)

  const hasDayAudioguide = plan.audioguideReadyDayIds.has(day.id)
  const cities = resolveNames(dayCities(day), guides)
  const drivingLegs = dt?.legs.size ?? 0

  const meta = [
    `${dayActs.length} ${dayActs.length === 1 ? 'actividad' : 'actividades'}`,
    arrivals.length > 0 && `${arrivals.length} ${arrivals.length === 1 ? 'llegada' : 'llegadas'}`,
    travelSeconds > 0 && formatDayTotal(travelSeconds),
  ].filter(Boolean).join(' · ')

  const connector = (key: string, fromName?: string, toName?: string, label?: string) => (
    <TravelConnector
      key={`conn-${key}`}
      leg={legs.get(key)}
      severity={legSeverity.get(key)}
      transit={dt?.routes.get(key)}
      drive={travelTimes.get(key)}
      from={dt?.legs.get(key)?.origin}
      to={dt?.legs.get(key)?.destination}
      fromName={fromName}
      toName={toName}
      label={label}
      onRedoTransit={canEdit ? () => setTransitScope({ dayIds: [day.id], label: 'para corregirlo', onlyKey: key }) : undefined}
    />
  )

  return (
    <section id={`day-${day.date}`} data-day={day.id} className="scroll-mt-4" aria-label={format(date, "EEEE d 'de' MMMM", { locale: es })}>
      <header className="flex items-start gap-3">
        <span className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl leading-none',
          isToday ? 'bg-primary text-primary-foreground shadow-card' : 'border border-border bg-card',
          isPast && 'opacity-70',
        )}>
          {/* Día y MES: el día de la semana abreviado («mar») se confunde con marzo. */}
          <span className="text-xl font-semibold tabular-nums">{format(date, 'd')}</span>
          <span className="mt-0.5 text-2xs font-semibold uppercase tracking-wider opacity-80">{format(date, 'MMM', { locale: es }).replace('.', '')}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="title-section first-letter:uppercase">{format(date, "EEEE d 'de' MMMM", { locale: es })}</h2>
            {isToday && <Badge tone="primary" solid>Hoy</Badge>}
            <ConflictBadge conflicts={conflicts} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Día {index + 1} · {meta}</p>
        </div>
        {weather && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm" aria-label={`Previsión: máxima ${weather.tmax} grados, mínima ${weather.tmin}`}>
            <span className="text-base leading-none" aria-hidden="true">{weatherIcon(weather.code)}</span>
            <span className="font-semibold tabular-nums">{weather.tmax}°</span>
            <span className="hidden tabular-nums text-muted-foreground sm:inline">{weather.tmin}°</span>
          </span>
        )}
        <IconButton label={collapsed ? 'Desplegar el día' : 'Plegar el día'} size="sm" aria-expanded={!collapsed} onClick={() => plan.toggleDay(day.id)}>
          <ChevronDown className={cn('transition-transform duration-200', collapsed && '-rotate-90')} />
        </IconButton>
      </header>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          <DayCities
            tripId={tripId} cities={cities} guides={guides} editMode={editMode}
            onChange={next => updateDayCities.mutate({ id: day.id, cities: next, tripId })}
          />
          <DayDriftNote drift={plan.driftByDay.get(day.id)} />

          {/* Lo que se puede hacer con el día, con su nombre. */}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <Button variant={hasDayAudioguide ? 'soft' : 'outline'} size="sm" asChild>
              <Link to={`/trips/${tripId}/dias/${day.id}/audioguide`}><Headphones /> {hasDayAudioguide ? 'Escuchar audioguía' : 'Audioguía'}</Link>
            </Button>
            <Button variant={hasJournal ? 'soft' : 'outline'} size="sm" onClick={() => onJournal(day)}>
              <BookHeart /> {hasJournal ? 'Ver diario' : 'Diario'}
            </Button>
            {editMode && drivingLegs > 0 && (
              <Button
                variant="outline" size="sm"
                title={dt!.pending.length > 0 ? `${dt!.pending.length} trayectos en coche sin ruta` : 'Volver a pedir las rutas de este día'}
                onClick={() => setTransitScope({ dayIds: [day.id], label: format(date, "'el' EEEE d", { locale: es }) })}
              >
                <TrainFront /> Transporte público
              </Button>
            )}
            {editMode && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/trips/${tripId}/itinerary/new?day=${day.id}`}><Plus /> Añadir</Link>
              </Button>
            )}
          </div>

          <DayConflicts conflicts={conflicts} />
          <DayAlerts tripId={tripId} day={day} alerts={plan.alertsByDay.get(day.id) ?? []} editMode={editMode} />

          {/* Llegadas de algo que empezó otro día (continuación, no se repite entero). */}
          {arrivals.map(a => {
            const dep = plan.dayDateById.get(a.day_id)
            return (
              <Link
                key={`arr-${a.id}`} to={`/trips/${tripId}/itinerary/${a.id}`}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-3.5 text-sm transition-colors hover:border-primary"
              >
                <CornerDownRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {a.end_time ? `Llega a las ${a.end_time.slice(0, 5)}` : 'Llega hoy'}
                  {dep && ` · salió el ${format(parseISO(dep), 'd MMM', { locale: es })}`}
                </span>
              </Link>
            )
          })}

          <Droppable id={day.id}>
            <SortableContext items={items.map(it => `${it.id}::${day.id}`)} strategy={verticalListSortingStrategy}>
              {items.length === 0 ? (
                editMode ? (
                  <button
                    type="button" onClick={() => navigate(`/trips/${tripId}/itinerary/new?day=${day.id}`)}
                    className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    <Plus className="size-4.5" aria-hidden="true" /> Añadir algo a este día
                  </button>
                ) : <p className="py-2 text-sm text-muted-foreground">Día libre: no hay nada planeado.</p>
              ) : (
                <>
                  {morningHotel && morningKey && legs.get(morningKey)
                    && connector(morningKey, morningHotel.title, titleOf(items[0]), `Sales de ${morningHotel.title}`)}
                  {items.flatMap((it, i) => {
                    const sortableId = `${it.id}::${day.id}`
                    const card = it.lodge
                      ? <LodgingRow key={it.id} tripId={tripId} lodging={it.lodge} sortableId={sortableId} editMode={editMode} />
                      : (
                        <ActivityCard
                          key={it.id} tripId={tripId} activity={it.act!} sortableId={sortableId}
                          attachments={plan.tripAttachments?.filter(a => a.activity_id === it.id)}
                          hasAudioguide={plan.audioguideReadyIds.has(it.id)}
                          editMode={editMode} currency={plan.trip?.default_currency || undefined}
                          onEdit={a => navigate(`/trips/${tripId}/itinerary/${a.id}/edit`)}
                          onDelete={onDelete}
                          onToggleDone={a => setActivityDone.mutate({ id: a.id, done: !a.done, tripId })}
                        />
                      )
                    const next = items[i + 1]
                    return next ? [card, connector(pairKey(it.id, next.id), titleOf(it), titleOf(next))] : [card]
                  })}
                </>
              )}
            </SortableContext>
          </Droppable>
        </div>
      )}
    </section>
  )
}
