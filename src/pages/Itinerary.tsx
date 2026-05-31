import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus, ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ActivityBlock } from '@/components/itinerary/ActivityBlock'
import { ActivityFormDialog } from '@/components/itinerary/ActivityFormDialog'
import {
  useItineraryDays, useActivities, useUpsertDays,
  useDeleteActivity, useReorderActivities, useUpdateDayNotes,
} from '@/lib/queries/itinerary'
import { useTrip } from '@/lib/queries/trips'
import { formatDate } from '@/lib/utils'
import type { Activity, ItineraryDay } from '@/types/database'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'

export function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId!)
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId!)
  const upsertDays = useUpsertDays()
  const deleteActivity = useDeleteActivity()
  const reorderActivities = useReorderActivities()
  const updateDayNotes = useUpdateDayNotes()

  const [formOpen, setFormOpen] = useState(false)
  const [editActivity, setEditActivity] = useState<Activity | null>(null)
  const [defaultDayId, setDefaultDayId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Auto-generar días desde start_date hasta end_date del viaje
  useEffect(() => {
    if (!trip || !days) return
    if (days.length > 0) return

    const dateRange = eachDayOfInterval({
      start: parseISO(trip.start_date),
      end: parseISO(trip.end_date),
    })
    const newDays = dateRange.map(d => ({
      trip_id: trip.id,
      date: format(d, 'yyyy-MM-dd'),
      notes: null,
    }))
    upsertDays.mutate(newDays)
  }, [trip, days])

  const activitiesByDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    activities?.forEach(a => {
      const existing = map.get(a.day_id) ?? []
      map.set(a.day_id, [...existing, a].sort((x, y) => x.order_index - y.order_index))
    })
    return map
  }, [activities])

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
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-medium">Itinerario</h1>
          {trip && (
            <p className="text-muted-foreground text-sm mt-1">
              {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
            </p>
          )}
        </div>
        <Button
          onClick={() => { setEditActivity(null); setDefaultDayId(days?.[0]?.id); setFormOpen(true) }}
          style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}
          className="gap-2"
        >
          <Plus size={16} />
          Añadir actividad
        </Button>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-40" style={{ background: '#1a1a26' }} />
              <Skeleton className="h-20 w-full" style={{ background: '#1a1a26' }} />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-8">
            {days?.map((day, dayIdx) => {
              const dayActs = activitiesByDay.get(day.id) ?? []
              const collapsed = collapsedDays.has(day.id)
              const dateLabel = format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })

              return (
                <motion.div
                  key={day.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dayIdx * 0.05 }}
                >
                  {/* Day header */}
                  <div
                    className="flex items-center gap-3 mb-3 cursor-pointer select-none"
                    onClick={() => toggleDay(day.id)}
                  >
                    <div className="w-10 h-10 rounded-full flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)' }}>
                      <span className="text-xs font-bold" style={{ color: '#c9a84c', lineHeight: 1 }}>
                        {format(parseISO(day.date), 'dd')}
                      </span>
                      <span className="text-xs" style={{ color: '#c9a84c', lineHeight: 1, fontSize: '9px' }}>
                        {format(parseISO(day.date), 'MMM', { locale: es }).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h2 className="font-serif text-lg font-medium capitalize">{dateLabel}</h2>
                      <p className="text-xs text-muted-foreground">Día {dayIdx + 1} · {dayActs.length} actividades</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditActivity(null)
                        setDefaultDayId(day.id)
                        setFormOpen(true)
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
                        <div className="mb-3 ml-13" style={{ marginLeft: '52px' }}>
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
                                  style={{ background: '#c9a84c', color: '#0a0a0f' }}
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

                        {/* Actividades */}
                        <div className="ml-13 space-y-2" style={{ marginLeft: '52px' }}>
                          <SortableContext items={dayActs.map(a => a.id)} strategy={verticalListSortingStrategy}>
                            {dayActs.length === 0 ? (
                              <div
                                className="flex items-center justify-center h-16 rounded-lg border border-dashed border-border text-muted-foreground text-sm cursor-pointer hover:border-primary transition-colors"
                                onClick={() => { setEditActivity(null); setDefaultDayId(day.id); setFormOpen(true) }}
                              >
                                <Plus size={14} className="mr-2" />
                                Añadir actividad para este día
                              </div>
                            ) : (
                              dayActs.map(activity => (
                                <ActivityBlock
                                  key={activity.id}
                                  activity={activity}
                                  onEdit={(a) => { setEditActivity(a); setFormOpen(true) }}
                                  onDelete={setDeleteTarget}
                                />
                              ))
                            )}
                          </SortableContext>
                        </div>
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

      <ActivityFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditActivity(null) }}
        tripId={tripId!}
        days={days ?? []}
        activity={editActivity}
        defaultDayId={defaultDayId}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
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
