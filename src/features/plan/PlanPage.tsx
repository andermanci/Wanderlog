import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { APIProvider } from '@vis.gl/react-google-maps'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarRange, ChevronsDownUp, ChevronsUpDown, Layers, Lightbulb, Map as MapIcon, Pencil, Plus, Route, TrainFront,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, Chip, Confirm, Empty, Menu, Segmented, Skeleton, useIsMobile } from '@/design'
import { cn } from '@/lib/utils'
import { useDeleteActivity } from '@/lib/queries/itinerary'
import { useJournalPhotos } from '@/lib/queries/journal'
import { useTripWeather } from '@/lib/queries/weather'
import { useDestinationGuides } from '@/lib/queries/guide'
import { toLiveSnapshot } from '@/lib/versions/snapshot'
import type { Activity, ItineraryDay } from '@/types/database'
import { VersionsPanel } from '@/features/versions/VersionsPanel'
import { ActivityPanel } from './activity/ActivityPanel'
import { TransitPanel } from './transit/TransitPanel'
import { PlanMap } from './map/PlanMap'
import { MapBoundary } from './map/MapBoundary'
import { IdeasList } from './ideas/IdeasList'
import { DayCard } from './DayCard'
import { DayJournalPanel } from './DayJournalPanel'
import { usePlanData } from './usePlanData'
import { usePlanStore } from './planStore'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

type View = 'dias' | 'ideas' | 'mapa'

/**
 * El Plan: «¿qué hacemos y cuándo?». Días, mapa e ideas en una sola pantalla.
 * Escritorio: lista a la izquierda y mapa siempre visible a la derecha.
 * Móvil: tres vistas (Días · Ideas · Mapa).
 *
 * Un único <APIProvider> para todo lo que cuelga de aquí (trayectos, mapa,
 * buscador de sitios, panel de actividad).
 */
export function PlanPage() {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <PlanInner />
    </APIProvider>
  )
}

function PlanInner() {
  const { tripId = '', activityId } = useParams<{ tripId: string; activityId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const mobile = useIsMobile()
  const plan = usePlanData(tripId)
  const { trip, days, activities, editMode, canEdit } = plan
  const { data: guides } = useDestinationGuides(tripId)
  const { data: journalPhotos } = useJournalPhotos(tripId)
  const { data: weather } = useTripWeather(trip, days, activities)
  const deleteActivity = useDeleteActivity()
  const setMapDay = usePlanStore(s => s.setMapDay)
  const mapDayId = usePlanStore(s => s.mapDayId)

  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [journalDay, setJournalDay] = useState<ItineraryDay | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const liveSnapshot = useMemo(
    () => (versionsOpen && activities && days ? toLiveSnapshot(activities, days) : []),
    [versionsOpen, activities, days],
  )

  // La vista vive en la URL: se puede enlazar y sobrevive a recargar.
  const view: View = searchParams.get('vista') === 'mapa' && mobile ? 'mapa' : searchParams.get('tab') === 'ideas' ? 'ideas' : 'dias'
  function setView(v: View) {
    const next = new URLSearchParams(searchParams)
    next.delete('vista'); next.delete('tab')
    if (v === 'mapa') next.set('vista', 'mapa')
    if (v === 'ideas') next.set('tab', 'ideas')
    setSearchParams(next, { replace: true })
  }

  // El panel de actividad sale de la ruta: /new, /:activityId, /:activityId/edit.
  const panelMode = location.pathname.endsWith('/itinerary/new') ? 'new' as const
    : activityId && location.pathname.endsWith('/edit') ? 'edit' as const
      : activityId ? 'detail' as const : null
  function closePanel() {
    const keep = new URLSearchParams()
    for (const k of ['vista', 'tab']) { const v = searchParams.get(k); if (v) keep.set(k, v) }
    navigate({ pathname: `/trips/${tripId}/itinerary`, search: keep.toString() })
  }

  // En táctil: mantener pulsado ~250 ms para arrastrar (no pelea con el scroll).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const scrollToDay = (day: ItineraryDay, smooth = true) =>
    document.getElementById(`day-${day.date}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })

  // Al entrar: salta al día de ?day= (fecha o id), o al de hoy si el viaje está en curso.
  const scrolled = useRef(false)
  useEffect(() => {
    // Se espera a tener las actividades: sin ellas los días miden menos y el salto se queda corto.
    if (scrolled.current || !days?.length || plan.loading || view !== 'dias') return
    const target = searchParams.get('day') || todayStr
    const day = days.find(d => d.date === target || d.id === target)
    if (!day) return
    // Se da por hecho DENTRO del temporizador: si los datos se refrescan antes de
    // que salte, este efecto se repite y vuelve a programarlo en vez de perderlo.
    const t = setTimeout(() => { scrolled.current = true; scrollToDay(day) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez, cuando llegan los días
  }, [days, view, plan.loading])

  // Con el viaje en curso, el mapa arranca enseñando el día de hoy (todo el
  // viaje junto suele incluir el vuelo y deja la ciudad en un punto).
  const mapSeeded = useRef(false)
  useEffect(() => {
    if (mapSeeded.current || !days?.length) return
    mapSeeded.current = true
    const today = days.find(d => d.date === todayStr)
    if (today && mapDayId === 'all') setMapDay(today.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez
  }, [days])

  // Elegir un día (en el mapa o en la tira) lleva la lista a ese día. En móvil,
  // si se eligió en la vista del mapa, se aplica al volver a «Días».
  const followedDay = useRef<string | null>(null)
  useEffect(() => {
    if (view !== 'dias' || mapDayId === 'all' || !days?.length || plan.loading) return
    if (followedDay.current === mapDayId) return
    const day = days.find(d => d.id === mapDayId)
    if (!day) return
    followedDay.current = mapDayId
    // El primer día que fija el propio Plan al abrir ya lo lleva el salto inicial.
    if (!scrolled.current) return
    const t = setTimeout(() => scrollToDay(day), 120)
    return () => clearTimeout(t)
     
  }, [mapDayId, view, days, plan.loading])

  // «Nota de diario» del botón «+»: abre el diario de hoy.
  useEffect(() => {
    if (searchParams.get('diario') !== 'hoy' || !days) return
    const today = days.find(d => d.date === todayStr)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre el panel al llegar con el parámetro en la URL
    if (today) setJournalDay(today)
    else toast.info('Hoy no es un día de este viaje. Elige el día y pulsa «Diario».')
    const next = new URLSearchParams(searchParams)
    next.delete('diario')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, days])

  const showMap = !mobile || view === 'mapa'
  const planEmpty = !!activities && activities.length === 0


  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      <section className={cn('flex min-h-0 flex-col md:w-[36rem] md:shrink-0 md:border-r md:border-border lg:w-[40rem]', view === 'mapa' ? 'shrink-0' : 'flex-1')}>
        {/* Cabecera de la columna: UNA fila (vista, editar, más opciones) y, en «Días»,
            la tira de días. Antes eran cuatro filas que se comían media pantalla del móvil. */}
        <header className="shrink-0 border-b border-border bg-background px-4 pt-3 md:px-6 md:pt-4">
          <div className="flex items-center gap-2 pb-3">
            <Segmented<View>
              label="Vista del plan" size="sm" value={view} onChange={setView}
              className="min-w-0 flex-1 md:flex-none"
              block={mobile}
              options={[
                { value: 'dias', label: 'Días', icon: CalendarRange },
                { value: 'ideas', label: 'Ideas', icon: Lightbulb },
                ...(mobile ? [{ value: 'mapa' as const, label: 'Mapa', icon: MapIcon }] : []),
              ]}
            />
            {view === 'dias' && (days?.length ?? 0) > 0 && (
              <>
                {canEdit && (
                  <Chip
                    icon={Pencil} selected={editMode}
                    onClick={() => plan.setMode(editMode ? 'view' : 'edit')}
                    className="md:ml-auto"
                  >
                    <span className="sr-only md:not-sr-only">{editMode ? 'Editando' : 'Editar'}</span>
                    <span className="sr-only">{editMode ? ': pulsa para solo ver' : ''}</span>
                  </Chip>
                )}
                <Menu
                  label="Más opciones del plan"
                  triggerVariant="outline"
                  items={[
                    { label: 'Versiones', hint: 'Guardar y comparar formas del plan', icon: Layers, onSelect: () => setVersionsOpen(true) },
                    canEdit && plan.transitDrivingTotal > 0 && {
                      label: 'Transporte público', icon: TrainFront,
                      hint: plan.transitPendingTotal > 0 ? `${plan.transitPendingTotal} trayectos en coche sin ruta` : 'Volver a pedir las rutas del viaje',
                      onSelect: () => plan.setTransitScope({ dayIds: days!.map(d => d.id), label: 'en todo el viaje' }),
                    },
                    plan.hasRoute && {
                      label: 'Ver recorrido', hint: 'El trayecto de todo el viaje en el mapa', icon: Route,
                      onSelect: () => {
                        // El mapa dibuja el recorrido de todo el viaje al recibir ?route=1 (lo consume él).
                        const next = new URLSearchParams(searchParams)
                        next.set('route', '1')
                        if (mobile) { next.delete('tab'); next.set('vista', 'mapa') }
                        setSearchParams(next)
                      },
                    },
                    {
                      label: plan.allDaysCollapsed ? 'Desplegar todos los días' : 'Plegar todos los días',
                      icon: plan.allDaysCollapsed ? ChevronsUpDown : ChevronsDownUp,
                      onSelect: plan.toggleAllDays, separated: true,
                    },
                  ]}
                />
              </>
            )}
            {/* Con el plan en blanco, la acción principal es la de la invitación de abajo. */}
            {editMode && !planEmpty && (
              <Button variant="primary" size="sm" className={cn('hidden md:inline-flex', view !== 'dias' && 'md:ml-auto')} onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}>
                <Plus /> Añadir actividad
              </Button>
            )}
          </div>

          {view === 'dias' && (days?.length ?? 0) > 0 && (
            <div>
              {/* Tira de días: salta a uno y dibuja su recorrido en el mapa. Fija: probó
                  a esconderse al bajar, pero mover el contenido mientras se lee desorienta. */}
              <div>
              <nav aria-label="Ir a un día" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
                {days!.map(d => {
                  const date = parseISO(d.date)
                  const today = d.date === todayStr
                  const selected = mapDayId === d.id
                  return (
                    <button
                      key={d.id} type="button"
                      aria-label={format(date, "EEEE d 'de' MMMM", { locale: es })}
                      aria-current={today ? 'date' : undefined}
                      onClick={() => { setMapDay(selected ? 'all' : d.id); scrollToDay(d) }}
                      className={cn(
                        'inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm leading-none transition-colors',
                        selected ? 'border-primary bg-primary text-primary-foreground shadow-card'
                          : today ? 'border-primary bg-primary-soft text-accent-foreground'
                            : 'border-border bg-card hover:bg-secondary',
                      )}
                    >
                      <span className="text-xs font-semibold uppercase opacity-70">{format(date, 'EEEEE', { locale: es })}</span>
                      <span className="font-semibold tabular-nums">{format(date, 'd')}</span>
                    </button>
                  )
                })}
              </nav>
              </div>
            </div>
          )}
        </header>

        {/* Contenido con scroll propio */}
        {view !== 'mapa' && (
          <div
            className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 md:px-6 md:pb-10', (view === 'ideas' || plan.loading) && 'pt-2')}
          >
            {view === 'ideas' ? (
              <IdeasList tripId={tripId} />
            ) : plan.loading ? (
              <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
            ) : !days?.length ? (
              <Empty icon={CalendarRange} title="Preparando los días…" description="Estamos creando un día por cada fecha del viaje." />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={plan.handleDragEnd}>
                {planEmpty && editMode && (
                  <div className="mb-2 mt-4 rounded-2xl bg-sunken p-5">
                    <h2 className="font-serif text-xl font-medium tracking-tight">Tu plan está en blanco</h2>
                    <p className="mt-1 text-[0.9375rem] text-muted-foreground">
                      Empieza por lo que ya sabes: el vuelo, el hotel o algo que no te quieres perder. Con el nombre y el día basta.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}><Plus /> Añadir lo primero</Button>
                      <Button variant="outline" onClick={() => setView('ideas')}><Lightbulb /> Guardar ideas</Button>
                    </div>
                  </div>
                )}
                <div className="space-y-8">
                  {days.map((day, i) => (
                    <DayCard
                      key={day.id} tripId={tripId} day={day} index={i} plan={plan} guides={guides}
                      weather={weather?.[day.date]}
                      hasJournal={!!day.journal || !!journalPhotos?.some(p => p.day_id === day.id)}
                      onJournal={setJournalDay} onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </DndContext>
            )}
          </div>
        )}
      </section>

      {showMap && (
        <section className="relative min-h-0 min-w-0 flex-1" aria-label="Mapa del plan">
          <MapBoundary><PlanMap tripId={tripId} /></MapBoundary>
        </section>
      )}

      {panelMode && (
        <ActivityPanel
          tripId={tripId} mode={panelMode} activityId={activityId}
          // Sin día indicado, lo nuevo va al día de hoy si el viaje está en curso.
          defaultDayId={searchParams.get('day') ?? days?.find(d => d.date === todayStr)?.id} onClose={closePanel}
        />
      )}
      {trip && days && (
        <VersionsPanel
          open={versionsOpen} onOpenChange={setVersionsOpen} trip={trip} days={days}
          live={liveSnapshot} liveTransit={plan.transitRows ?? []} canEdit={canEdit}
        />
      )}
      {trip && (
        <TransitPanel
          open={!!plan.transitScope} onOpenChange={o => { if (!o) plan.setTransitScope(null) }}
          tripId={tripId} tripLabel={[trip.name, trip.destination].filter(Boolean).join(' — ')}
          scopeLabel={plan.transitScope?.label ?? ''} redo={plan.transitRedo} legs={plan.transitLegs}
        />
      )}
      <DayJournalPanel tripId={tripId} day={journalDay} onClose={() => setJournalDay(null)} />
      <Confirm
        open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }} danger
        title="¿Eliminar esta actividad?"
        description={`Se borrará «${deleteTarget?.title ?? ''}». No se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleteTarget) deleteActivity.mutate({ id: deleteTarget.id, tripId })
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
