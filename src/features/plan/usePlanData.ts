import { useEffect, useMemo, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { DragEndEvent } from '@dnd-kit/core'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import {
  useActivities, useItineraryDays, useRehostGoogleCovers, useReorderActivities, useUpsertDays,
} from '@/lib/queries/itinerary'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { legsForDay, useTripTravelTimes, type PendingLeg } from '@/lib/queries/travelTime'
import { dayTransit, effectiveLeg, useTransitRoutes, type DayTransit } from '@/lib/queries/transitRoutes'
import { estimatedDriveLeg, estimatedWalkLeg, type TransitLegInput } from '@/lib/transit/exchange'
import { describeRoute } from '@/lib/transit/labels'
import { isMove, pairKey } from '@/lib/travelTime'
import { useBackfillTimezones } from '@/lib/queries/timezones'
import { detectTripConflicts } from '@/lib/conflicts'
import { resolveEditMode, useItineraryModeStore } from '@/store/itineraryModeStore'
import { useDayAlerts } from '@/lib/queries/dayAlerts'
import { useTrip } from '@/lib/queries/trips'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useDocuments } from '@/lib/queries/documents'
import { useTripAudioguidesReadiness } from '@/lib/queries/audioguides'
import { buildRoutePoints } from '@/lib/route'
import { dayOrderOf, lodgingByDayMap } from '@/lib/lodging'
import type { Activity, DayAlert } from '@/types/database'

/** Qué trayectos se piden a la IA: un día, el viaje entero, o uno solo (`onlyKey`). */
export interface TransitScope { dayIds: string[]; label: string; onlyKey?: string }

/**
 * Todo lo que el Plan calcula a partir de los datos: actividades por día,
 * llegadas, alojamientos, trayectos, transporte público, conflictos y el
 * arrastre. Es la lógica de la pantalla antigua movida aquí tal cual, para que
 * la interfaz solo pinte.
 *
 * Necesita un <APIProvider> ancestro (usa la librería `routes` de Google Maps).
 */
export function usePlanData(tripId: string) {
  const { data: trip } = useTrip(tripId)
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId)
  const { data: tripAttachments } = useTripAttachments(tripId)
  const { data: documents } = useDocuments(tripId)
  const { data: audioguideReadiness } = useTripAudioguidesReadiness(tripId)
  const { data: dayAlerts } = useDayAlerts(tripId)
  const { data: myRole } = useTripRole(tripId)
  const { mode, setMode } = useItineraryModeStore()
  const upsertDays = useUpsertDays()
  const reorderActivities = useReorderActivities()

  // Solo lectura para quien entra con permiso de ver (la RLS bloquearía igual
  // las escrituras; esto evita ofrecer botones que fallarían).
  const canEdit = canEditRole(myRole)
  const editMode = resolveEditMode(mode, trip) && canEdit

  // Defensa contra la caché persistida: puede traer todavía la forma vieja (un
  // array suelto de ids de actividad, de antes de las audioguías de día).
  const audioguideReadyIds = useMemo(
    () => new Set(Array.isArray(audioguideReadiness) ? audioguideReadiness : audioguideReadiness?.activityIds ?? []),
    [audioguideReadiness],
  )
  const audioguideReadyDayIds = useMemo(
    () => new Set(Array.isArray(audioguideReadiness) ? [] : audioguideReadiness?.dayIds ?? []),
    [audioguideReadiness],
  )

  // Las portadas heredadas que aún apuntan a Google se copian a Storage la
  // primera vez que se abre el viaje (después dejan de facturarse en cada vista).
  useRehostGoogleCovers(tripId, activities, canEdit)

  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  // Genera los días que falten del rango del viaje (alta inicial y cuando se
  // alargan las fechas después).
  useEffect(() => {
    if (!trip || !days || loadingDays) return
    const want = eachDayOfInterval({ start: parseISO(trip.start_date), end: parseISO(trip.end_date) })
      .map(d => format(d, 'yyyy-MM-dd'))
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

  const dayDateById = useMemo(() => new Map((days ?? []).map(d => [d.id, d.date])), [days])

  // MOVIMIENTOS (vuelo/transporte) que terminan otro día: se muestran también
  // en el día de llegada como «continuación». (Los hoteles NO: son estancia.)
  const arrivalsByDay = useMemo(() => {
    const map = new Map<string, Activity[]>()
    activities?.forEach(a => {
      if (isMove(a) && a.end_day_id && a.end_day_id !== a.day_id) {
        map.set(a.end_day_id, [...(map.get(a.end_day_id) ?? []), a])
      }
    })
    return map
  }, [activities])

  // ALOJAMIENTO: una fila en CADA día de la estancia (entrada → noches → salida).
  const lodgingByDay = useMemo(() => lodgingByDayMap(activities, days), [activities, days])

  const alertsByDay = useMemo(() => {
    const map = new Map<string, DayAlert[]>()
    dayAlerts?.forEach(a => { map.set(a.day_id, [...(map.get(a.day_id) ?? []), a]) })
    return map
  }, [dayAlerts])

  // ¿Hay al menos 2 paradas para que tenga sentido «Ver recorrido»?
  const hasRoute = useMemo(
    () => !!activities && !!days && buildRoutePoints(activities, days).length >= 2,
    [activities, days],
  )

  // Lo ordenable de un día: actividades no-hotel + hoteles que lo cubren.
  function combinedItemsFor(dayId: string): Activity[] {
    const acts = (activitiesByDay.get(dayId) ?? []).filter(a => a.type !== 'hotel')
    const lodgings = (lodgingByDay.get(dayId) ?? []).map(l => l.activity)
    return [...acts, ...lodgings].sort((a, b) => dayOrderOf(a, dayId) - dayOrderOf(b, dayId))
  }

  // El hotel donde se ha dormido (el día no es el de entrada). Si el día no
  // empieza ya en él, el primer trayecto es desde ese hotel: suele ser el más
  // largo del día.
  function morningHotelFor(dayId: string): Activity | null {
    const slept = (lodgingByDay.get(dayId) ?? []).find(l => l.role === 'mid' || l.role === 'out')?.activity
    const first = combinedItemsFor(dayId)[0]
    return slept && first && first.id !== slept.id ? slept : null
  }
  // La secuencia de la que salen los trayectos: la del día, con el hotel de la mañana delante.
  function legItemsFor(dayId: string): Activity[] {
    const morning = morningHotelFor(dayId)
    const items = combinedItemsFor(dayId)
    return morning ? [morning, ...items] : items
  }

  // Tiempos de viaje (a pie / en coche) entre paradas consecutivas de cada día.
  const routesLib = useMapsLibrary('routes')
  const travelTimes = useTripTravelTimes({ days, combinedItemsFor: legItemsFor, collapsedDays, routesLib })

  // Transporte público: para cada trayecto en coche, la ruta guardada (si la
  // hay y sigue vigente) y los que faltan por sugerir. Si una ruta compensa,
  // sustituye al coche en el conector, en el total del día y en los conflictos.
  const { data: transitRows } = useTransitRoutes(tripId)
  const [transitScope, setTransitScope] = useState<TransitScope | null>(null)
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
    // Trayectos que Google no ha devuelto (sin conexión, cuota agotada): a pie
    // se estiman distancia y tiempo; en coche, solo la distancia. Así nunca
    // falta el conector, y con él la ficha de transporte público del trayecto.
    transitByDay.forEach(dt => {
      dt.walking.forEach(l => {
        const k = pairKey(l.fromId, l.toId)
        if (!merged.has(k)) merged.set(k, estimatedWalkLeg(l.origin, l.destination))
      })
      dt.legs.forEach((l, k) => {
        if (!merged.has(k)) merged.set(k, estimatedDriveLeg(l.origin, l.destination))
      })
    })
    transitByDay.forEach(dt => dt.routes.forEach((route, k) => {
      const eff = effectiveLeg(travelTimes.get(k), route, dt.legs.get(k))
      if (eff) merged.set(k, eff)
    }))
    return merged
  }, [travelTimes, transitByDay])

  const transitDrivingTotal = useMemo(
    () => [...transitByDay.values()].reduce((n, dt) => n + dt.legs.size, 0), [transitByDay])
  const transitPendingTotal = useMemo(
    () => [...transitByDay.values()].reduce((n, dt) => n + dt.pending.length, 0), [transitByDay])

  // Trayectos que van en el encargo de transporte público (un día o el viaje
  // entero): los que están en coche y aún no tienen una ruta vigente.
  const transitLegs = useMemo((): TransitLegInput[] => {
    if (!transitScope) return []
    const byId = new Map((activities ?? []).map(a => [a.id, a]))
    // La fecha de cada día va al encargo: con las horas, la IA sabe cuándo se hace cada trayecto.
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
  const transitRedo = !!transitScope
    && (!!transitScope.onlyKey || transitScope.dayIds.every(id => !(transitByDay.get(id)?.pending.length)))

  // Husos horarios: resuelve los que falten (en segundo plano) y deduce en qué
  // zona está cada día. Sin esto, un vuelo Madrid–Tokio da una duración absurda.
  const zones = useBackfillTimezones(tripId, activities, days, canEdit)

  // Actividades con reserva vinculada: tienen hora comprometida, así que sí se
  // avisa si no se llega.
  const bookedIds = useMemo(
    () => new Set((documents ?? []).map(d => d.activity_id).filter((id): id is string => !!id)),
    [documents],
  )

  // Conflictos: cruza las horas con los tiempos de trayecto. Se derivan de
  // `activities`, que el arrastre ya actualiza de forma optimista.
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

    // Los ids tienen ámbito por día: «activityId::dayId» (un hotel aparece en
    // varios días). La zona soltable del día usa solo «dayId».
    const parse = (id: string) => { const [aid, dId] = id.split('::'); return { aid, dId } }
    const { aid: activeAid, dId: sourceDay } = parse(String(active.id))
    const activeActivity = activities?.find(a => a.id === activeAid)
    if (!activeActivity) return

    const overP = parse(String(over.id))
    // Día donde se suelta (elemento con ámbito, o el contenedor del día sin «::»).
    const dropDayId = overP.dId ?? String(over.id)

    // El hotel se reordena DENTRO de su día de arrastre (no cambia de día); el
    // resto puede moverse al día destino.
    const isHotel = activeActivity.type === 'hotel'
    const targetDay = isHotel ? sourceDay : dropDayId

    const items = combinedItemsFor(targetDay).filter(a => a.id !== activeAid)
    let newIndex = items.length
    if (overP.dId === targetDay && overP.aid) {
      const idx = items.findIndex(a => a.id === overP.aid)
      if (idx !== -1) newIndex = idx
    }

    const reordered = [...items.slice(0, newIndex), activeActivity, ...items.slice(newIndex)]
    // El hotel guarda su posición SOLO en este día (day_orders); el resto adopta
    // el día destino con su order_index. Así reordenar un día no afecta a los demás.
    const updates = reordered.map((a, i) =>
      a.type === 'hotel'
        ? { id: a.id, trip_id: tripId, day_orders: { ...(a.day_orders ?? {}), [targetDay]: i } }
        : { id: a.id, trip_id: tripId, day_id: targetDay, order_index: i },
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

  return {
    trip, days, activities, tripAttachments, loading: loadingDays || loadingActs,
    canEdit, editMode, setMode,
    audioguideReadyIds, audioguideReadyDayIds,
    activitiesByDay, dayDateById, arrivalsByDay, lodgingByDay, alertsByDay, hasRoute,
    morningHotelFor,
    travelTimes, legs, transitRows, transitByDay, transitDrivingTotal, transitPendingTotal,
    transitScope, setTransitScope, transitLegs, transitRedo,
    conflictsByDay, legSeverity, driftByDay,
    handleDragEnd,
    collapsedDays, toggleDay, allDaysCollapsed, toggleAllDays,
  }
}

export type PlanData = ReturnType<typeof usePlanData>
