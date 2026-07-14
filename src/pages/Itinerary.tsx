import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, ChevronDown, ChevronsDownUp, ChevronsUpDown, Route, BookOpen, CornerDownRight, BedDouble, GripVertical, MapPin, Pencil, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ActivityBlock } from '@/components/itinerary/ActivityBlock'
import { DayJournalDialog } from '@/components/itinerary/DayJournalDialog'
import { DayAlerts } from '@/components/itinerary/DayAlerts'
import { TripOverview } from '@/components/itinerary/TripOverview'
import { TravelConnector } from '@/components/itinerary/TravelConnector'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useTripWeather, weatherIcon } from '@/lib/queries/weather'
import {
  useItineraryDays, useActivities, useUpsertDays,
  useDeleteActivity, useReorderActivities, useUpdateDayGuide, useUpdateDayCity, useSetActivityDone,
  useRehostGoogleCovers,
} from '@/lib/queries/itinerary'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { useTripTravelTimes } from '@/lib/queries/travelTime'
import { pairKey, formatDayTotal, isMove } from '@/lib/travelTime'
import { useBackfillTimezones } from '@/lib/queries/timezones'
import { detectTripConflicts } from '@/lib/conflicts'
import { DayConflicts, ConflictBadge, DayDriftNote } from '@/components/itinerary/DayConflicts'
import { useItineraryModeStore, resolveEditMode } from '@/store/itineraryModeStore'
import { useDayAlerts } from '@/lib/queries/dayAlerts'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useTrip } from '@/lib/queries/trips'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useDocuments } from '@/lib/queries/documents'
import { useTripAudioguidesReadiness } from '@/lib/queries/audioguides'
import { buildRoutePoints } from '@/lib/route'
import { lodgingByDayMap, dayOrderOf, type Lodging } from '@/lib/lodging'
import { TripHeader } from '@/components/trips/TripHeader'
import type { Activity, DayAlert, ItineraryDay } from '@/types/database'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

// El conector de tiempos de viaje necesita la librería 'routes' de Google
// Maps, que a su vez necesita un <APIProvider> ancestro — de ahí este
// envoltorio ligero alrededor del componente real de la página.
export function ItineraryPage() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <ItineraryPageInner />
    </APIProvider>
  )
}

function ItineraryPageInner() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: trip } = useTrip(tripId!)
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId!)
  const { data: tripAttachments } = useTripAttachments(tripId!)
  const { data: documents } = useDocuments(tripId!)
  const { data: audioguideReadyIdList } = useTripAudioguidesReadiness(tripId!)
  // Array.isArray como defensa: la caché persistida en localStorage puede
  // traer todavía un valor viejo (de antes de este cambio) con otra forma.
  const audioguideReadyIds = useMemo(
    () => new Set(Array.isArray(audioguideReadyIdList) ? audioguideReadyIdList : []),
    [audioguideReadyIdList],
  )
  const upsertDays = useUpsertDays()
  const deleteActivity = useDeleteActivity()
  const reorderActivities = useReorderActivities()
  const updateDayGuide = useUpdateDayGuide()
  const updateDayCity = useUpdateDayCity()
  const setActivityDone = useSetActivityDone()
  const { data: guides } = useDestinationGuides(tripId!)
  const { data: dayAlerts } = useDayAlerts(tripId!)
  const { mode, setMode } = useItineraryModeStore()
  const { data: myRole } = useTripRole(tripId!)
  // Solo lectura para colaboradores con permiso 'viewer' (la RLS bloquearía
  // igualmente las escrituras; esto evita ofrecer botones que fallarían).
  const canEdit = canEditRole(myRole)
  const editMode = resolveEditMode(mode, trip) && canEdit

  // Las portadas heredadas que aún apuntan a Google se copian a Storage la
  // primera vez que se abre el viaje (después dejan de facturarse en cada vista).
  useRehostGoogleCovers(tripId, activities, canEdit)

  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [journalDay, setJournalDay] = useState<ItineraryDay | null>(null)
  const { data: journalPhotos } = useJournalPhotos(tripId!)
  const { data: weather } = useTripWeather(trip, days, activities)
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
      if (isMove(a) && a.end_day_id && a.end_day_id !== a.day_id) {
        map.set(a.end_day_id, [...(map.get(a.end_day_id) ?? []), a])
      }
    })
    return map
  }, [activities])

  // ALOJAMIENTO (hotel): banner en CADA día de la estancia (entrada → noches → salida).
  const lodgingByDay = useMemo(() => lodgingByDayMap(activities, days), [activities, days])

  // ALERTAS destacadas (callouts) agrupadas por día.
  const alertsByDay = useMemo(() => {
    const map = new Map<string, DayAlert[]>()
    dayAlerts?.forEach(a => {
      map.set(a.day_id, [...(map.get(a.day_id) ?? []), a])
    })
    return map
  }, [dayAlerts])

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

  // Items ordenables de un día: actividades no-hotel del día + hoteles que lo
  // cubren (como banner), ordenados por order_index.
  function combinedItemsFor(dayId: string): Activity[] {
    const acts = (activitiesByDay.get(dayId) ?? []).filter(a => a.type !== 'hotel')
    const lodgings = (lodgingByDay.get(dayId) ?? []).map(l => l.activity)
    return [...acts, ...lodgings].sort((a, b) => dayOrderOf(a, dayId) - dayOrderOf(b, dayId))
  }

  // Tiempos de viaje (a pie / en coche) entre paradas consecutivas de cada
  // día, para el conector que se pinta entre tarjetas de actividad.
  const routesLib = useMapsLibrary('routes')
  const travelTimes = useTripTravelTimes({ days, combinedItemsFor, collapsedDays, routesLib })

  // Husos horarios: resuelve los que falten (en segundo plano) y deduce en qué
  // zona está cada día. Sin esto, un vuelo Madrid–Tokio da una duración absurda
  // y los conflictos entre husos distintos no se pueden calcular.
  const zones = useBackfillTimezones(tripId, activities, days, canEdit)

  // Actividades con una reserva vinculada (documents.activity_id, que enlaza la
  // importación del .ics): tienen hora comprometida, así que sí se avisa si no
  // se llega.
  const bookedIds = useMemo(
    () => new Set((documents ?? []).map(d => d.activity_id).filter((id): id is string => !!id)),
    [documents],
  )

  // Conflictos del itinerario: cruza las horas con los tiempos de trayecto que
  // ya se estaban calculando. Se derivan de `activities`, que el drag & drop ya
  // actualiza de forma optimista, así que el aviso aparece o desaparece al
  // soltar, sin trabajo extra durante el gesto.
  const { byDay: conflictsByDay, legSeverity, driftByDay } = useMemo(() => detectTripConflicts({
    days: days ?? [],
    itemsFor: combinedItemsFor,
    arrivalsFor: (dayId: string) => arrivalsByDay.get(dayId) ?? [],
    dateByDayId: new Map((days ?? []).map(d => [d.id, d.date])),
    zones,
    legs: travelTimes,
    today: format(new Date(), 'yyyy-MM-dd'),
    bookedIds,
  }), [days, activities, arrivalsByDay, zones, travelTimes, bookedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Los ids tienen ámbito por día: "activityId::dayId" (un hotel aparece en
    // varios días). La zona soltable del día usa solo "dayId".
    const parse = (id: string) => { const [aid, dId] = id.split('::'); return { aid, dId } }
    const { aid: activeAid, dId: sourceDay } = parse(String(active.id))
    const activeActivity = activities?.find(a => a.id === activeAid)
    if (!activeActivity) return

    const overP = parse(String(over.id))
    // Día donde se suelta (item con ámbito, o el contenedor del día sin "::").
    const dropDayId = overP.dId ?? String(over.id)

    // El hotel se reordena DENTRO de su propio día de arrastre (no cambia de día);
    // el resto puede moverse al día destino.
    const isHotel = activeActivity.type === 'hotel'
    const targetDay = isHotel ? sourceDay : dropDayId

    const items = combinedItemsFor(targetDay).filter(a => a.id !== activeAid)
    let newIndex = items.length
    if (overP.dId === targetDay && overP.aid) {
      const idx = items.findIndex(a => a.id === overP.aid)
      if (idx !== -1) newIndex = idx
    }

    const reordered = [...items.slice(0, newIndex), activeActivity, ...items.slice(newIndex)]
    // El hotel guarda su posición SOLO en este día (day_orders); el resto adopta el
    // día destino con su order_index. Así reordenar un día no afecta a los demás.
    const updates = reordered.map((a, i) =>
      a.type === 'hotel'
        ? { id: a.id, trip_id: tripId!, day_orders: { ...(a.day_orders ?? {}), [targetDay]: i } }
        : { id: a.id, trip_id: tripId!, day_id: targetDay, order_index: i },
    )
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

  const allDaysCollapsed = (days?.length ?? 0) > 0 && collapsedDays.size === days!.length
  function toggleAllDays() {
    if (!days) return
    setCollapsedDays(allDaysCollapsed ? new Set() : new Set(days.map(d => d.id)))
  }

  const loading = loadingDays || loadingActs
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Itinerario" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-medium">Itinerario</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan día a día</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(days?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={toggleAllDays}
              aria-label={allDaysCollapsed ? 'Expandir todos los días' : 'Colapsar todos los días'}
              title={allDaysCollapsed ? 'Expandir todos los días' : 'Colapsar todos los días'}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border transition-colors hover:bg-secondary"
            >
              {allDaysCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
              <span className="hidden sm:inline">{allDaysCollapsed ? 'Expandir todos' : 'Colapsar todos'}</span>
            </button>
          )}
          {/* Toggle Editar / Ver (sin permiso de edición, siempre en Ver) */}
          {canEdit && (
          <div className="flex items-center p-0.5 rounded-lg" style={{ background: 'var(--secondary)' }} role="group" aria-label="Modo del itinerario">
            <button
              onClick={() => setMode('edit')}
              aria-pressed={editMode}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors"
              style={editMode
                ? { background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' }
                : { color: 'var(--muted-foreground)' }}
            >
              <Pencil size={13} />
              Editar
            </button>
            <button
              onClick={() => setMode('view')}
              aria-pressed={!editMode}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors"
              style={!editMode
                ? { background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' }
                : { color: 'var(--muted-foreground)' }}
            >
              <Eye size={13} />
              Ver
            </button>
          </div>
          )}
          {hasRoute && (
            <Button variant="outline" className="gap-2" asChild>
              <Link to={`/trips/${tripId}/map?route=1`} aria-label="Ver recorrido" title="Ver recorrido">
                <Route size={16} />
                <span className="hidden sm:inline">Ver recorrido</span>
              </Link>
            </Button>
          )}
          {editMode && (
            <Button
              onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}
              variant="brand"
              className="gap-2"
              aria-label="Añadir actividad" title="Añadir actividad"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Añadir actividad</span>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : (
        <>
          {trip && days && activities && (
            <TripOverview trip={trip} days={days} activities={activities} />
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-8">
              {days?.map((day, dayIdx) => {
                // Los hoteles se muestran como banner de estancia en cada día, pero
                // se ordenan junto al resto: lista combinada (actividades no-hotel +
                // banners de hotel) ordenada por order_index, toda arrastrable.
                const dayActs = (activitiesByDay.get(day.id) ?? []).filter(a => a.type !== 'hotel')
                const dayArrivals = arrivalsByDay.get(day.id) ?? []
                const dayLodging = lodgingByDay.get(day.id) ?? []
                const dayConflicts = conflictsByDay.get(day.id) ?? []
                const dayItems = [
                  ...dayActs.map(a => ({ id: a.id, order: a.order_index, act: a, lodge: null as Lodging | null })),
                  ...dayLodging.map(l => ({ id: l.activity.id, order: dayOrderOf(l.activity, day.id), act: null as Activity | null, lodge: l })),
                ].sort((x, y) => x.order - y.order)
                // Suma de los tramos con tiempo ya resuelto (los que faltan por
                // cargar o sin coordenadas simplemente no cuentan).
                const dayTravelTotalSeconds = dayItems.slice(0, -1).reduce((sum, it, i) => {
                  const leg = travelTimes.get(pairKey(it.id, dayItems[i + 1].id))
                  return leg ? sum + leg.durationSeconds : sum
                }, 0)
                const collapsed = collapsedDays.has(day.id)
                const dateLabel = format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })
                const isToday = day.date === todayStr
                const isPast = day.date < todayStr
                const hasJournal = !!day.journal || !!journalPhotos?.some(p => p.day_id === day.id)
                // "Dónde estoy" ese día: la ciudad puesta a mano tiene prioridad;
                // si no, la de la guía de destino asignada (si la hay).
                const dayGuideName = day.guide_id ? guides?.find(g => g.id === day.guide_id)?.name : undefined
                const whereLabel = day.city || dayGuideName || null

                return (
                  <motion.div
                    key={day.id}
                    id={`day-${day.date}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(dayIdx * 0.04, 0.3) }}
                    style={{ scrollMarginTop: 16 }}
                  >
                    {/* Cabecera del día (a todo el ancho, sin tarjeta) */}
                    <div
                      className="flex items-start gap-3 mb-3 cursor-pointer select-none"
                      onClick={() => toggleDay(day.id)}
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                        style={isToday
                          ? { background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }
                          : {
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              color: isPast ? 'var(--muted-foreground)' : 'var(--foreground)',
                              opacity: isPast ? 0.75 : 1,
                            }}
                      >
                        <span className="text-sm font-semibold" style={{ lineHeight: 1 }}>
                          {format(parseISO(day.date), 'dd')}
                        </span>
                        <span className="uppercase" style={{ lineHeight: 1, fontSize: '9px', opacity: 0.8 }}>
                          {format(parseISO(day.date), 'MMM', { locale: es })}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-serif text-base sm:text-lg font-medium capitalize truncate">{dateLabel}</h2>
                          {isToday && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                              style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
                              Hoy
                            </span>
                          )}
                          {/* Se ve el problema sin desplegar el día */}
                          <ConflictBadge conflicts={dayConflicts} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Día {dayIdx + 1} · {dayActs.length} {dayActs.length === 1 ? 'actividad' : 'actividades'}
                          {dayArrivals.length > 0 && ` · ${dayArrivals.length} llegada${dayArrivals.length > 1 ? 's' : ''}`}
                          {dayTravelTotalSeconds > 0 && ` · ${formatDayTotal(dayTravelTotalSeconds)}`}
                        </p>
                        {/* Los trayectos que no caben en las horas escritas */}
                        <DayDriftNote drift={driftByDay.get(day.id)} />
                        {/* Guía de destino del día (contenido de la ciudad, opcional) */}
                        {editMode && (guides?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                            <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
                            <Select
                              value={day.guide_id ?? 'none'}
                              onValueChange={(v) => updateDayGuide.mutate({ id: day.id, guideId: v === 'none' ? null : v, tripId: tripId! })}
                            >
                              <SelectTrigger className="h-7 text-xs w-auto min-w-[120px] max-w-[180px] gap-1.5">
                                <SelectValue placeholder="Sin ciudad" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin ciudad</SelectItem>
                                {guides!.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {day.guide_id && (
                              <Link to={`/trips/${tripId}/guide`} onClick={(e) => e.stopPropagation()}
                                aria-label="Ver guía del destino" title="Ver guía del destino"
                                className="text-primary hover:opacity-80 flex-shrink-0">
                                <BookOpen size={14} />
                              </Link>
                            )}
                          </div>
                        )}
                        {/* Ciudad del día en modo Ver (solo lectura + enlace a la guía) */}
                        {!editMode && day.guide_id && (
                          <Link
                            to={`/trips/${tripId}/guide`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:opacity-80 w-fit"
                            title="Ver guía del destino"
                          >
                            <MapPin size={13} className="flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{guides?.find(g => g.id === day.guide_id)?.name ?? 'Ciudad'}</span>
                            <BookOpen size={13} className="flex-shrink-0" />
                          </Link>
                        )}
                      </div>

                      {editMode ? (
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            defaultValue={day.city ?? ''}
                            placeholder={dayGuideName || 'Ciudad'}
                            onBlur={(e) => {
                              const value = e.target.value.trim()
                              if (value !== (day.city ?? '')) {
                                updateDayCity.mutate({ id: day.id, city: value || null, tripId: tripId! })
                              }
                            }}
                            className="h-7 text-xs px-2 rounded-md border border-border bg-background w-20 sm:w-28 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      ) : whereLabel && (
                        <span
                          className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                        >
                          <MapPin size={11} className="flex-shrink-0" />
                          <span className="truncate max-w-[90px] sm:max-w-[160px]">{whereLabel}</span>
                        </span>
                      )}

                      {weather?.[day.date] && (
                        <span
                          className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 px-2 py-1 rounded-full mt-0.5"
                          style={{ background: 'var(--secondary)' }}
                          aria-label="Previsión del día" title="Previsión del día"
                        >
                          <span className="text-base leading-none">{weatherIcon(weather[day.date].code)}</span>
                          <span className="font-medium text-foreground">{weather[day.date].tmax}°</span>
                          <span className="opacity-60 hidden sm:inline">/ {weather[day.date].tmin}°</span>
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 relative"
                          aria-label="Diario del día" title="Diario del día"
                          onClick={(e) => { e.stopPropagation(); setJournalDay(day) }}
                        >
                          <BookOpen size={14} style={hasJournal ? { color: 'var(--primary)' } : undefined} />
                          {hasJournal && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                          )}
                        </Button>
                        {editMode && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            aria-label="Añadir actividad a este día" title="Añadir actividad"
                            onClick={(e) => { e.stopPropagation(); navigate(`/trips/${tripId}/itinerary/new?day=${day.id}`) }}
                          >
                            <Plus size={14} />
                          </Button>
                        )}
                        <ChevronDown
                          size={16}
                          className="text-muted-foreground transition-transform"
                          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}
                        />
                      </div>
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
                          {/* Alertas destacadas del día */}
                          <DayConflicts conflicts={dayConflicts} />
                          <DayAlerts tripId={tripId!} day={day} alerts={alertsByDay.get(day.id) ?? []} editMode={editMode} />

                          {/* Llegadas del día anterior (continuación, no se repiten enteras) */}
                          {dayArrivals.length > 0 && (
                            <div className="space-y-1.5 mb-2">
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

                          {/* Actividades + estancias (lista combinada, arrastrable, a todo el ancho).
                              Sin space-y: el ritmo vertical lo pone el propio TravelConnector
                              intercalado entre cada par (línea de tiempos de viaje o hueco simple). */}
                          <DayDroppable id={day.id}>
                            <SortableContext items={dayItems.map(it => `${it.id}::${day.id}`)} strategy={verticalListSortingStrategy}>
                              {dayItems.length === 0 ? (
                                editMode ? (
                                  <div
                                    className="flex items-center justify-center h-16 rounded-xl border border-dashed border-border text-muted-foreground text-sm cursor-pointer hover:border-primary transition-colors"
                                    onClick={() => navigate(`/trips/${tripId}/itinerary/new?day=${day.id}`)}
                                  >
                                    <Plus size={14} className="mr-2" />
                                    Añadir actividad para este día
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground py-2">Sin actividades</p>
                                )
                              ) : (
                                dayItems.flatMap((it, i) => {
                                  const card = it.lodge ? (
                                    <SortableLodgingBanner key={it.id} sortableId={`${it.id}::${day.id}`} lodging={it.lodge} tripId={tripId!} editMode={editMode} />
                                  ) : (
                                    <ActivityBlock
                                      key={it.id}
                                      sortableId={`${it.id}::${day.id}`}
                                      activity={it.act!}
                                      attachments={tripAttachments?.filter(a => a.activity_id === it.id)}
                                      hasAudioguide={audioguideReadyIds?.has(it.id)}
                                      editMode={editMode}
                                      onEdit={(a) => navigate(`/trips/${tripId}/itinerary/${a.id}/edit`)}
                                      onDelete={setDeleteTarget}
                                      onOpen={(a) => navigate(`/trips/${tripId}/itinerary/${a.id}`)}
                                      onToggleDone={(a) => setActivityDone.mutate({ id: a.id, done: !a.done, tripId: tripId! })}
                                    />
                                  )
                                  const next = dayItems[i + 1]
                                  if (!next) return [card]
                                  const key = pairKey(it.id, next.id)
                                  return [card, (
                                    <TravelConnector
                                      key={`conn-${it.id}-${next.id}`}
                                      leg={travelTimes.get(key)}
                                      severity={legSeverity.get(key)}
                                    />
                                  )]
                                })
                              )}
                            </SortableContext>
                          </DayDroppable>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </DndContext>
        </>
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

// Banner de estancia (hotel) arrastrable: se ordena junto al resto de
// actividades del día. El asa arrastra; el cuerpo abre el detalle.
function SortableLodgingBanner({ sortableId, lodging, tripId, editMode = true }: { sortableId: string; lodging: Lodging; tripId: string; editMode?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const l = lodging
  const roleLabel = l.role === 'single' ? '1 noche'
    : l.role === 'out' ? 'Salida'
      : l.role === 'in' ? `Entrada · noche 1/${l.nights}`
        : `Noche ${l.night}/${l.nights}`
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
      }}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
    >
      {/* Columna de igual ancho que la asa/checkbox de ActivityBlock, para que
          el TravelConnector quede alineado igual sobre cualquier combinación
          de tarjeta/banner consecutivos. */}
      {editMode ? (
        <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical size={13} />
        </button>
      ) : (
        <span className="flex-shrink-0 w-8" />
      )}
      <BedDouble size={15} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
      <Link to={`/trips/${tripId}/itinerary/${l.activity.id}`} className="flex-1 min-w-0 truncate font-medium hover:underline">
        {l.activity.title}
      </Link>
      <span className="text-xs flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--primary)' }}>{roleLabel}</span>
    </div>
  )
}
