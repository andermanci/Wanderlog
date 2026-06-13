import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus, ChevronDown, Pencil, Route, BookOpen, CornerDownRight, BedDouble } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ActivityBlock } from '@/components/itinerary/ActivityBlock'
import { DayJournalDialog } from '@/components/itinerary/DayJournalDialog'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useTripWeather, weatherIcon } from '@/lib/queries/weather'
import {
  useItineraryDays, useActivities, useUpsertDays,
  useDeleteActivity, useReorderActivities, useUpdateDayNotes,
} from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { useTripAttachments } from '@/lib/queries/attachments'
import { buildRoutePoints } from '@/lib/route'
import { TripHeader } from '@/components/trips/TripHeader'
import type { Activity, ItineraryDay } from '@/types/database'
import { eachDayOfInterval, parseISO, format, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'

export function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: trip } = useTrip(tripId!)
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId!)
  const { data: tripAttachments } = useTripAttachments(tripId!)
  const upsertDays = useUpsertDays()
  const deleteActivity = useDeleteActivity()
  const reorderActivities = useReorderActivities()
  const updateDayNotes = useUpdateDayNotes()

  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [journalDay, setJournalDay] = useState<ItineraryDay | null>(null)
  const { data: journalPhotos } = useJournalPhotos(tripId!)
  const { data: weather } = useTripWeather(trip, days, activities)
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  // En táctil: mantener pulsado ~250 ms para arrastrar (no pelea con el scroll).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  // Genera/rellena los días que falten del rango del viaje (cubre el alta
  // inicial y también cuando se alargan las fechas después).
  useEffect(() => {
    if (!trip || !days || loadingDays) return
    const want = eachDayOfInterval({
      start: parseISO(trip.start_date),
      end: parseISO(trip.end_date),
    }).map(d => format(d, 'yyyy-MM-dd'))
    const have = new Set(days.map(d => d.date))
    const missing = want.filter(d => !have.has(d)).map(date => ({ trip_id: trip.id, date, notes: null }))
    if (missing.length) upsertDays.mutate(missing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, days, loadingDays])

  const activitiesByDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    activities?.forEach(a => {
      const existing = map.get(a.day_id) ?? []
      map.set(a.day_id, [...existing, a].sort((x, y) => x.order_index - y.order_index))
    })
    return map
  }, [activities])

  const dayDateById = useMemo(
    () => new Map((days ?? []).map(d => [d.id, d.date])),
    [days],
  )

  // MOVIMIENTOS (vuelo/transporte) que terminan otro día: se muestran también
  // en el día de llegada como "continuación". (Los hoteles NO: son estancia.)
  const arrivalsByDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    activities?.forEach(a => {
      const isMove = a.type === 'flight' || a.type === 'transport'
      if (isMove && a.end_day_id && a.end_day_id !== a.day_id) {
        map.set(a.end_day_id, [...(map.get(a.end_day_id) ?? []), a])
      }
    })
    return map
  }, [activities])

  // ALOJAMIENTO (hotel): se muestra como banner en CADA día de la estancia
  // (entrada → noches → salida), no como una actividad puntual.
  type Lodging = { activity: Activity; role: 'in' | 'mid' | 'out' | 'single'; night: number; nights: number }
  const lodgingByDay = useMemo(() => {
    const map = new Map<string, Lodging[]>()
    const dateById = new Map((days ?? []).map(d => [d.id, d.date]))
    activities?.filter(a => a.type === 'hotel').forEach(a => {
      const inDate = dateById.get(a.day_id)
      if (!inDate) return
      const outDate = (a.end_day_id && dateById.get(a.end_day_id)) || inDate
      const nights = Math.max(0, differenceInCalendarDays(parseISO(outDate), parseISO(inDate)))
      ;(days ?? []).forEach(d => {
        if (d.date < inDate || d.date > outDate) return
        const offset = differenceInCalendarDays(parseISO(d.date), parseISO(inDate))
        const role: Lodging['role'] = inDate === outDate ? 'single'
          : d.date === inDate ? 'in' : d.date === outDate ? 'out' : 'mid'
        map.set(d.id, [...(map.get(d.id) ?? []), { activity: a, role, night: offset + 1, nights }])
      })
    })
    return map
  }, [activities, days])

  // ¿Hay al menos 2 paradas para mostrar el botón de recorrido?
  const hasRoute = useMemo(
    () => !!activities && !!days && buildRoutePoints(activities, days).length >= 2,
    [activities, days],
  )

  // Salta al día indicado en ?day=<fecha> (al volver del detalle de una
  // actividad) o, si no, al día de hoy cuando el viaje está en curso.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !days?.length) return
    const target = searchParams.get('day') || format(new Date(), 'yyyy-MM-dd')
    if (!days.some(d => d.date === target)) return
    scrolled.current = true
    setTimeout(() => {
      document.getElementById(`day-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 350)
  }, [days, searchParams])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeActivity = activities?.find(a => a.id === active.id)
    if (!activeActivity) return

    const overActivity = activities?.find(a => a.id === over.id)
    const overDay = days?.find(d => d.id === over.id)

    const targetDayId = overActivity?.day_id ?? overDay?.id ?? activeActivity.day_id
    const dayActivities = (activitiesByDay.get(targetDayId) ?? []).filter(a => a.id !== active.id)

    let newIndex = dayActivities.length
    if (overActivity) {
      newIndex = dayActivities.findIndex(a => a.id === overActivity.id)
      if (newIndex === -1) newIndex = dayActivities.length
    }

    const reordered = [
      ...dayActivities.slice(0, newIndex),
      activeActivity,
      ...dayActivities.slice(newIndex),
    ]

    const updates = reordered.map((a, i) => ({
      id: a.id,
      day_id: targetDayId,
      order_index: i,
      trip_id: tripId!,
    }))

    reorderActivities.mutate(updates)
  }

  function toggleDay(dayId: string) {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(dayId)) next.delete(dayId)
      else next.add(dayId)
      return next
    })
  }

  const loading = loadingDays || loadingActs

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Itinerario" />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="font-serif text-2xl font-medium">Itinerario</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan día a día</p>
        </div>
        <div className="flex items-center gap-2">
          {hasRoute && (
            <Button variant="outline" className="gap-2" asChild>
              <Link to={`/trips/${tripId}/map?route=1`}>
                <Route size={16} />
                Ver recorrido
              </Link>
            </Button>
          )}
          <Button
            onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}
            style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
            className="gap-2"
          >
            <Plus size={16} />
            Añadir actividad
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-40" style={{ background: 'var(--secondary)' }} />
              <Skeleton className="h-20 w-full" style={{ background: 'var(--secondary)' }} />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-8">
            {days?.map((day, dayIdx) => {
              // Los hoteles no son bloques en la línea de tiempo: van como banner de estancia.
              const dayActs = (activitiesByDay.get(day.id) ?? []).filter(a => a.type !== 'hotel')
              const dayArrivals = arrivalsByDay.get(day.id) ?? []
              const dayLodging = lodgingByDay.get(day.id) ?? []
              const collapsed = collapsedDays.has(day.id)
              const dateLabel = format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })

              return (
                <motion.div
                  key={day.id}
                  id={`day-${day.date}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dayIdx * 0.05 }}
                  style={{ scrollMarginTop: 16 }}
                >
                  {/* Day header */}
                  <div
                    className="flex items-center gap-3 mb-3 cursor-pointer select-none"
                    onClick={() => toggleDay(day.id)}
                  >
                    <div className="w-10 h-10 rounded-full flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
                      <span className="text-xs font-bold" style={{ color: 'var(--primary)', lineHeight: 1 }}>
                        {format(parseISO(day.date), 'dd')}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--primary)', lineHeight: 1, fontSize: '9px' }}>
                        {format(parseISO(day.date), 'MMM', { locale: es }).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-serif text-base sm:text-lg font-medium capitalize truncate">{dateLabel}</h2>
                      <p className="text-xs text-muted-foreground">
                        Día {dayIdx + 1} · {dayActs.length} actividades
                        {dayArrivals.length > 0 && ` · ${dayArrivals.length} llegada${dayArrivals.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {weather?.[day.date] && (
                      <span
                        className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0"
                        title="Previsión del día"
                      >
                        <span className="text-base leading-none">{weatherIcon(weather[day.date].code)}</span>
                        <span className="font-medium text-foreground">{weather[day.date].tmax}°</span>
                        <span className="opacity-60 hidden sm:inline">/ {weather[day.date].tmin}°</span>
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 relative"
                      title="Diario del día"
                      onClick={(e) => {
                        e.stopPropagation()
                        setJournalDay(day)
                      }}
                    >
                      <BookOpen size={14} style={(day.journal || journalPhotos?.some(p => p.day_id === day.id)) ? { color: 'var(--primary)' } : undefined} />
                      {(day.journal || journalPhotos?.some(p => p.day_id === day.id)) && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/trips/${tripId}/itinerary/new?day=${day.id}`)
                      }}
                    >
                      <Plus size={14} />
                    </Button>
                    <ChevronDown
                      size={16}
                      className="text-muted-foreground transition-transform"
                      style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}
                    />
                  </div>

                  <AnimatePresence>
                    {!collapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {/* Notas del día */}
                        <div className="mb-3 sm:ml-[52px]">
                          {editingNotes === day.id ? (
                            <div className="flex gap-2">
                              <Textarea
                                value={notesValue}
                                onChange={(e) => setNotesValue(e.target.value)}
                                className="text-xs min-h-[60px]"
                                placeholder="Notas del día..."
                                autoFocus
                              />
                              <div className="flex flex-col gap-1">
                                <Button size="sm" className="text-xs h-7"
                                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                                  onClick={() => {
                                    updateDayNotes.mutate({ id: day.id, notes: notesValue, tripId: tripId! })
                                    setEditingNotes(null)
                                  }}>
                                  OK
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs h-7"
                                  onClick={() => setEditingNotes(null)}>
                                  ✕
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingNotes(day.id); setNotesValue(day.notes ?? '') }}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                              <Pencil size={10} />
                              {day.notes ? day.notes : 'Añadir notas del día...'}
                            </button>
                          )}
                        </div>

                        {/* Alojamiento: banner de estancia en cada día (dónde duermes) */}
                        {dayLodging.length > 0 && (
                          <div className="space-y-1.5 sm:ml-[52px] mb-2">
                            {dayLodging.map(l => {
                              const roleLabel =
                                l.role === 'single' ? '1 noche'
                                  : l.role === 'out' ? 'Salida'
                                    : l.role === 'in' ? `Entrada · noche 1/${l.nights}`
                                      : `Noche ${l.night}/${l.nights}`
                              return (
                                <Link
                                  key={`lodge-${l.activity.id}`}
                                  to={`/trips/${tripId}/itinerary/${l.activity.id}`}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:brightness-105"
                                  style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)' }}
                                >
                                  <BedDouble size={15} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                                  <span className="flex-1 min-w-0 truncate font-medium">{l.activity.title}</span>
                                  <span className="text-xs flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--primary)' }}>{roleLabel}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}

                        {/* Llegadas del día anterior (continuación, no se repiten enteras) */}
                        {dayArrivals.length > 0 && (
                          <div className="space-y-1.5 sm:ml-[52px] mb-2">
                            {dayArrivals.map(a => {
                              const depDate = dayDateById.get(a.day_id)
                              return (
                                <Link
                                  key={`arr-${a.id}`}
                                  to={`/trips/${tripId}/itinerary/${a.id}`}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors hover:border-primary"
                                  style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--primary) 5%, transparent)' }}
                                >
                                  <CornerDownRight size={14} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                                  <span className="flex-1 min-w-0 truncate text-muted-foreground">
                                    <span className="text-foreground">{a.title}</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                                    {a.end_time ? `llega ${a.end_time.slice(0, 5)}` : 'llega'}
                                    {depDate && ` · del ${format(parseISO(depDate), 'dd MMM', { locale: es })}`}
                                  </span>
                                </Link>
                              )
                            })}
                          </div>
                        )}

                        {/* Actividades (zona soltable: permite mover actividades a este día) */}
                        <DayDroppable id={day.id} className="space-y-2 sm:ml-[52px]">
                          <SortableContext items={dayActs.map(a => a.id)} strategy={verticalListSortingStrategy}>
                            {dayActs.length === 0 ? (
                              <div
                                className="flex items-center justify-center h-16 rounded-lg border border-dashed border-border text-muted-foreground text-sm cursor-pointer hover:border-primary transition-colors"
                                onClick={() => navigate(`/trips/${tripId}/itinerary/new?day=${day.id}`)}
                              >
                                <Plus size={14} className="mr-2" />
                                Añadir actividad para este día
                              </div>
                            ) : (
                              dayActs.map(activity => (
                                <ActivityBlock
                                  key={activity.id}
                                  activity={activity}
                                  attachments={tripAttachments?.filter(a => a.activity_id === activity.id)}
                                  onEdit={(a) => navigate(`/trips/${tripId}/itinerary/${a.id}/edit`)}
                                  onDelete={setDeleteTarget}
                                  onOpen={(a) => navigate(`/trips/${tripId}/itinerary/${a.id}`)}
                                />
                              ))
                            )}
                          </SortableContext>
                        </DayDroppable>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Separador */}
                  {dayIdx < (days.length - 1) && (
                    <div className="flex items-center gap-3 mt-6 ml-5">
                      <div className="w-0.5 h-4 bg-border mx-auto" style={{ marginLeft: '19px' }} />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </DndContext>
      )}

      <DayJournalDialog
        open={!!journalDay}
        onClose={() => setJournalDay(null)}
        tripId={tripId!}
        day={journalDay}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.title}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteActivity.mutate({ id: deleteTarget.id, tripId: tripId! })
                setDeleteTarget(null)
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

// Zona soltable por día: permite arrastrar una actividad a este día aunque
// todavía no tenga ninguna (resalta el día al pasar por encima arrastrando).
function DayDroppable({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={isOver ? { outline: '2px dashed color-mix(in srgb, var(--primary) 55%, transparent)', outlineOffset: 4, borderRadius: 12 } : undefined}
    >
      {children}
    </div>
  )
}
