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
import { Plus, ChevronDown, ChevronsDownUp, ChevronsUpDown, Route, BookOpen, CornerDownRight, BedDouble, GripVertical, Headphones, MapPin, Pencil, Eye, Layers, TrainFront } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ActivityBlock } from '@/components/itinerary/ActivityBlock'
import { DayCitiesEditor } from '@/components/itinerary/DayCitiesEditor'
import { DayJournalDialog } from '@/components/itinerary/DayJournalDialog'
import { DayAlerts } from '@/components/itinerary/DayAlerts'
import { TripOverview } from '@/components/itinerary/TripOverview'
import { TravelConnector } from '@/components/itinerary/TravelConnector'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useTripWeather, weatherIcon } from '@/lib/queries/weather'
import {
  useItineraryDays, useActivities, useUpsertDays,
  useDeleteActivity, useReorderActivities, useUpdateDayCities, useSetActivityDone,
  useRehostGoogleCovers,
} from '@/lib/queries/itinerary'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { useTripTravelTimes, legsForDay, type PendingLeg } from '@/lib/queries/travelTime'
import { useTransitRoutes, dayTransit, effectiveLeg, type DayTransit } from '@/lib/queries/transitRoutes'
import { estimatedWalkLeg, type TransitLegInput } from '@/lib/transit/exchange'
import { describeRoute } from '@/lib/transit/labels'
import { TransitPromptDialog } from '@/components/itinerary/TransitPromptDialog'
import { pairKey, formatDayTotal, isMove } from '@/lib/travelTime'
import { useBackfillTimezones } from '@/lib/queries/timezones'
import { detectTripConflicts } from '@/lib/conflicts'
import { dayCities, resolveNames } from '@/lib/cities'
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
import { VersionsSheet } from '@/components/versions/VersionsSheet'
import { toLiveSnapshot } from '@/lib/versions/snapshot'
import type { Activity, DayAlert, ItineraryDay } from '@/types/database'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

// El conector de tiempos de viaje necesita la librería 'routes' de Google
// Maps, que a su vez necesita un <APIProvider> ancestro — de ahí este
// envoltorio ligero alrededor del componente real de la página.
// Herramientas de vista de la cabecera: todas con la misma altura que el
// selector Editar/Ver para que la barra quede alineada. En móvil, solo icono.
const TOOL = 'inline-flex items-center justify-center gap-1.5 h-8 min-w-8 px-2 sm:px-2.5 text-xs font-medium rounded-md border border-border transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2'

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
  const { data: audioguideReadiness } = useTripAudioguidesReadiness(tripId!)
  // Defensa contra la caché persistida en localStorage: puede traer todavía la
  // forma vieja (un array suelto de ids de actividad, de antes de que las
  // audioguías pudieran ser de un día).
  const audioguideReadyIds = useMemo(
    () => new Set(Array.isArray(audioguideReadiness)
      ? audioguideReadiness
      : audioguideReadiness?.activityIds ?? []),
    [audioguideReadiness],
  )
  const audioguideReadyDayIds = useMemo(
    () => new Set(Array.isArray(audioguideReadiness) ? [] : audioguideReadiness?.dayIds ?? []),
    [audioguideReadiness],
  )
  const upsertDays = useUpsertDays()
  const deleteActivity = useDeleteActivity()
  const reorderActivities = useReorderActivities()
  const updateDayCities = useUpdateDayCities()
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
  const [versionsOpen, setVersionsOpen] = useState(false)
  const liveSnapshot = useMemo(
    () => (versionsOpen && activities && days ? toLiveSnapshot(activities, days) : []),
    [versionsOpen, activities, days],
  )

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

  // El hotel donde se ha dormido (el día no es el de entrada). Si el día no
  // empieza ya en él, el primer trayecto es desde ese hotel: suele ser el más
  // largo del día y antes no existía, porque el banner del hotel va al final.
  function morningHotelFor(dayId: string): Activity | null {
    const slept = (lodgingByDay.get(dayId) ?? []).find(l => l.role === 'mid' || l.role === 'out')?.activity
    const first = combinedItemsFor(dayId)[0]
    return slept && first && first.id !== slept.id ? slept : null
  }
  // La secuencia de la que salen los trayectos: la del día, con el hotel de
  // la mañana delante.
  function legItemsFor(dayId: string): Activity[] {
    const morning = morningHotelFor(dayId)
    const items = combinedItemsFor(dayId)
    return morning ? [morning, ...items] : items
  }

  // Tiempos de viaje (a pie / en coche) entre paradas consecutivas de cada
  // día, para el conector que se pinta entre tarjetas de actividad.
  const routesLib = useMapsLibrary('routes')
  const travelTimes = useTripTravelTimes({ days, combinedItemsFor: legItemsFor, collapsedDays, routesLib })

  // Transporte público: para cada trayecto en coche, la ruta guardada (si la
  // hay y sigue vigente) y los que faltan por sugerir. Si una ruta compensa,
  // sustituye al coche en el conector, en el total del día y en los conflictos.
  const { data: transitRows } = useTransitRoutes(tripId)
  // `onlyKey`: corregir un único trayecto (desde su ficha).
  const [transitScope, setTransitScope] = useState<{ dayIds: string[]; label: string; onlyKey?: string } | null>(null)
  const transitByDay = useMemo(() => {
    const rowsByPair = new Map((transitRows ?? []).map(r => [pairKey(r.from_activity_id, r.to_activity_id), r]))
    const map = new Map<string, DayTransit & { legs: Map<string, PendingLeg>; walking: PendingLeg[] }>()
    for (const day of days ?? []) {
      const all = legsForDay(legItemsFor(day.id))
      const driving = all.filter(l => l.mode === 'DRIVING')
      map.set(day.id, {
        ...dayTransit(driving, rowsByPair),
        legs: new Map(driving.map(l => [pairKey(l.fromId, l.toId), l])),
        walking: all.filter(l => l.mode === 'WALKING'),
      })
    }
    return map
  }, [days, activities, transitRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const legs = useMemo(() => {
    const merged = new Map(travelTimes)
    // Trayectos a pie que Google no ha devuelto: se estiman, para que entre
    // dos sitios cercanos nunca falte la distancia.
    transitByDay.forEach(dt => dt.walking.forEach(l => {
      const k = pairKey(l.fromId, l.toId)
      if (!merged.has(k)) merged.set(k, estimatedWalkLeg(l.origin, l.destination))
    }))
    transitByDay.forEach(dt => dt.routes.forEach((route, k) => {
      const eff = effectiveLeg(travelTimes.get(k), route, dt.legs.get(k))
      if (eff) merged.set(k, eff)
    }))
    return merged
  }, [travelTimes, transitByDay])
  const transitDrivingTotal = useMemo(
    () => [...transitByDay.values()].reduce((n, dt) => n + dt.legs.size, 0),
    [transitByDay],
  )
  const transitPendingTotal = useMemo(
    () => [...transitByDay.values()].reduce((n, dt) => n + dt.pending.length, 0),
    [transitByDay],
  )

  // Trayectos que van en el prompt de transporte público (un día o el viaje
  // entero): los que están en coche y aún no tienen una ruta vigente.
  const transitLegs = useMemo((): TransitLegInput[] => {
    if (!transitScope) return []
    const byId = new Map((activities ?? []).map(a => [a.id, a]))
    // La fecha de cada día va al prompt: con las horas de las actividades, la
    // IA sabe cuándo se hace cada trayecto.
    const dateOf = new Map((days ?? []).map(d => [d.id, d.date]))
    if (transitScope.onlyKey) {
      const dt = transitByDay.get(transitScope.dayIds[0])
      const leg = dt?.legs.get(transitScope.onlyKey)
      const from = leg && byId.get(leg.fromId)
      const to = leg && byId.get(leg.toId)
      const saved = dt?.routes.get(transitScope.onlyKey)
      return leg && from && to
        ? [{ leg, from, to, drive: travelTimes.get(transitScope.onlyKey), previous: saved ? describeRoute(saved) : undefined, date: dateOf.get(transitScope.dayIds[0]) }]
        : []
    }
    // Si en esos días ya está todo pedido, es para rehacerlo: van todos los
    // trayectos en coche y las rutas nuevas sustituyen a las guardadas.
    const pendingInScope = transitScope.dayIds.some(id => (transitByDay.get(id)?.pending.length ?? 0) > 0)
    const legsOf = (dayId: string) => {
      const dt = transitByDay.get(dayId)
      return pendingInScope ? dt?.pending ?? [] : [...(dt?.legs.values() ?? [])]
    }
    return transitScope.dayIds.flatMap(dayId => legsOf(dayId).flatMap(leg => {
      const from = byId.get(leg.fromId)
      const to = byId.get(leg.toId)
      return from && to ? [{ leg, from, to, drive: travelTimes.get(pairKey(leg.fromId, leg.toId)), date: dateOf.get(dayId) }] : []
    }))
  }, [transitScope, transitByDay, activities, travelTimes, days])


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
    legs,
    today: format(new Date(), 'yyyy-MM-dd'),
    bookedIds,
  }), [days, activities, arrivalsByDay, zones, legs, bookedIds]) // eslint-disable-line react-hooks/exhaustive-deps

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
      {trip && days && (
        <VersionsSheet open={versionsOpen} onOpenChange={setVersionsOpen} trip={trip} days={days} live={liveSnapshot} liveTransit={transitRows ?? []} canEdit={canEdit} />
      )}
      {trip && (
        <TransitPromptDialog
          open={!!transitScope}
          onOpenChange={(o) => { if (!o) setTransitScope(null) }}
          tripId={tripId!}
          tripLabel={[trip.name, trip.destination].filter(Boolean).join(' — ')}
          scopeLabel={transitScope?.label ?? ''}
          redo={!!transitScope && (!!transitScope.onlyKey || transitScope.dayIds.every(id => !(transitByDay.get(id)?.pending.length)))}
          legs={transitLegs}
        />
      )}
      {/* Dos niveles: el título con la acción principal, y debajo una barra de
          herramientas de una sola altura (el modo a la izquierda, las
          herramientas de vista a la derecha). En una sola fila, cinco
          controles de dos tamaños distintos se descolgaban al saltar de línea. */}
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="font-serif text-2xl font-medium">Itinerario</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan día a día</p>
        </div>
        {editMode && (
          <Button
            onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}
            variant="brand"
            className="gap-2 shrink-0"
            aria-label="Añadir actividad" title="Añadir actividad"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Añadir actividad</span>
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mb-6">
        {/* Toggle Editar / Ver (sin permiso de edición, siempre en Ver) */}
        {canEdit ? (
          <div className="flex items-center h-8 p-0.5 rounded-lg" style={{ background: 'var(--secondary)' }} role="group" aria-label="Modo del itinerario">
            <button
              onClick={() => setMode('edit')}
              aria-pressed={editMode}
              className="flex items-center gap-1.5 h-7 text-xs font-medium px-2.5 rounded-md transition-colors"
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
              className="flex items-center gap-1.5 h-7 text-xs font-medium px-2.5 rounded-md transition-colors"
              style={!editMode
                ? { background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' }
                : { color: 'var(--muted-foreground)' }}
            >
              <Eye size={13} />
              Ver
            </button>
          </div>
        ) : <span />}
        {(days?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleAllDays}
              aria-label={allDaysCollapsed ? 'Expandir todos los días' : 'Colapsar todos los días'}
              title={allDaysCollapsed ? 'Expandir todos los días' : 'Colapsar todos los días'}
              className={TOOL}
            >
              {allDaysCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
              <span className="hidden sm:inline">{allDaysCollapsed ? 'Expandir todos' : 'Colapsar todos'}</span>
            </button>
            {hasRoute && (
              <Link to={`/trips/${tripId}/map?route=1`} aria-label="Ver recorrido" title="Ver recorrido" className={TOOL}>
                <Route size={14} />
                <span className="hidden sm:inline">Ver recorrido</span>
              </Link>
            )}
            {canEdit && transitDrivingTotal > 0 && (
              <button
                type="button"
                onClick={() => setTransitScope({ dayIds: (days ?? []).map(d => d.id), label: 'en todo el viaje' })}
                aria-label="Sugerir transporte público en todo el viaje"
                title={transitPendingTotal > 0
                  ? `Sugerir transporte público en los ${transitPendingTotal} trayectos en coche sin ruta`
                  : 'Rehacer el transporte público de todo el viaje'}
                className={`${TOOL} disabled:opacity-60`}
              >
                <TrainFront size={14} />
                <span className="hidden sm:inline">Transporte público</span>
              </button>
            )}
            <button type="button" onClick={() => setVersionsOpen(true)} aria-label="Versiones" title="Guardar y comparar versiones" className={TOOL}>
              <Layers size={14} />
              <span className="hidden sm:inline">Versiones</span>
            </button>
          </div>
        )}
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
                const morningHotel = morningHotelFor(day.id)
                const morningKey = morningHotel && dayItems[0] ? pairKey(morningHotel.id, dayItems[0].id) : null
                const dayTravelTotalSeconds = dayItems.slice(0, -1).reduce((sum, it, i) => {
                  const leg = legs.get(pairKey(it.id, dayItems[i + 1].id))
                  return leg ? sum + leg.durationSeconds : sum
                }, morningKey ? legs.get(morningKey)?.durationSeconds ?? 0 : 0)
                const collapsed = collapsedDays.has(day.id)
                const dateLabel = format(parseISO(day.date), "EEEE dd 'de' MMMM", { locale: es })
                const isToday = day.date === todayStr
                const isPast = day.date < todayStr
                const hasJournal = !!day.journal || !!journalPhotos?.some(p => p.day_id === day.id)
                const hasDayAudioguide = audioguideReadyDayIds.has(day.id)
                // "Dónde estoy" ese día: las ciudades en orden ("Roma · Tívoli").
                // El nombre lo manda la guía cuando la ciudad viene de una.
                const dayCityList = resolveNames(dayCities(day), guides)

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
                          <h2 className="font-serif text-base sm:text-lg font-medium capitalize truncate">
                            {/* En el móvil la fecha larga no cabe junto a los botones y se cortaba. */}
                            <span className="sm:hidden">{format(parseISO(day.date), 'EEE d MMM', { locale: es })}</span>
                            <span className="hidden sm:inline">{dateLabel}</span>
                          </h2>
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
                        {/* Ciudades del día: varias, y cada una puede llevar guía */}
                        {editMode && (
                          <DayCitiesEditor
                            cities={dayCityList}
                            guides={guides}
                            onChange={(cities) => updateDayCities.mutate({ id: day.id, cities, tripId: tripId! })}
                          />
                        )}
                        {/* En modo Ver: "Roma · Ostia Antica", y las que tienen guía
                            la abren. Va debajo del título y no al lado para no
                            robarle el ancho a la fecha en el móvil. */}
                        {!editMode && dayCityList.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1.5 text-xs">
                            <MapPin size={12} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                            {dayCityList.map((c, i) => (
                              <span key={`${c.guide_id ?? 'txt'}-${c.name}-${i}`} className="flex items-center gap-1">
                                {i > 0 && <span aria-hidden="true" className="opacity-40">·</span>}
                                {c.guide_id ? (
                                  <Link
                                    to={`/trips/${tripId}/guide`}
                                    onClick={(e) => e.stopPropagation()}
                                    title={`Ver guía de ${c.name}`}
                                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:opacity-80"
                                  >
                                    {c.name}
                                    <BookOpen size={11} className="flex-shrink-0" />
                                  </Link>
                                ) : (
                                  <span className="font-medium text-muted-foreground">{c.name}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

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
                        {/* Audioguía de la ciudad del día: el sujeto es la
                            ciudad, no ninguna de las actividades, así que vive
                            en la cabecera y no dentro de una tarjeta. */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 relative"
                          aria-label="Audioguía de la ciudad" title="Audioguía de la ciudad"
                          onClick={(e) => { e.stopPropagation(); navigate(`/trips/${tripId}/dias/${day.id}/audioguide`) }}
                        >
                          <Headphones size={14} style={hasDayAudioguide ? { color: 'var(--primary)' } : undefined} />
                          {hasDayAudioguide && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                          )}
                        </Button>
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
                        {editMode && (transitByDay.get(day.id)?.legs.size ?? 0) > 0 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            aria-label="Sugerir transporte público para este día"
                            title={transitByDay.get(day.id)!.pending.length > 0
                              ? `Sugerir transporte público (${transitByDay.get(day.id)!.pending.length} trayectos en coche sin ruta)`
                              : 'Rehacer el transporte público de este día'}
                            onClick={(e) => { e.stopPropagation(); setTransitScope({ dayIds: [day.id], label: format(parseISO(day.date), "'el' EEEE d", { locale: es }) }) }}
                          >
                            <TrainFront size={14} />
                          </Button>
                        )}
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
                                [...(morningHotel && morningKey && legs.get(morningKey) ? [
                                  <div key="morning" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                                    <BedDouble size={13} aria-hidden="true" />
                                    <span className="truncate">Sales de <span className="font-medium text-foreground">{morningHotel.title}</span></span>
                                  </div>,
                                  <TravelConnector
                                    key="morning-conn"
                                    leg={legs.get(morningKey)}
                                    transit={transitByDay.get(day.id)?.routes.get(morningKey)}
                                    drive={travelTimes.get(morningKey)}
                                    from={transitByDay.get(day.id)?.legs.get(morningKey)?.origin}
                                    to={transitByDay.get(day.id)?.legs.get(morningKey)?.destination}
                                    fromName={morningHotel.title}
                                    toName={dayItems[0].act?.title ?? dayItems[0].lodge?.activity.title}
                                    onRedoTransit={canEdit ? () => setTransitScope({ dayIds: [day.id], label: 'para corregirlo', onlyKey: morningKey }) : undefined}
                                  />,
                                ] : []), ...dayItems.flatMap((it, i) => {
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
                                  const dt = transitByDay.get(day.id)
                                  const driving = dt?.legs.get(key)
                                  return [card, (
                                    <TravelConnector
                                      key={`conn-${it.id}-${next.id}`}
                                      leg={legs.get(key)}
                                      severity={legSeverity.get(key)}
                                      transit={dt?.routes.get(key)}
                                      drive={travelTimes.get(key)}
                                      from={driving?.origin}
                                      to={driving?.destination}
                                      fromName={it.act?.title ?? it.lodge?.activity.title}
                                      toName={next.act?.title ?? next.lodge?.activity.title}
                      onRedoTransit={canEdit ? () => setTransitScope({ dayIds: [day.id], label: 'para corregirlo', onlyKey: key }) : undefined}
                                    />
                                  )]
                                })]
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
        <AlertDialogContent className="surface">
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
