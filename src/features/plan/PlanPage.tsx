import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { APIProvider } from '@vis.gl/react-google-maps'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarRange, ChevronsDownUp, ChevronsUpDown, Eye, Layers, Lightbulb, Map as MapIcon, Pencil, Plus, Route, TrainFront,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, Confirm, Empty, Segmented, Skeleton, useIsMobile } from '@/design'
import { cn, effectiveStatus } from '@/lib/utils'
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

  const status = trip ? effectiveStatus(trip) : null
  const elapsed = status === 'in_progress' ? (days ?? []).filter(d => d.date <= todayStr).length : 0
  const showMap = !mobile || view === 'mapa'

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      <section className={cn('flex min-h-0 flex-col md:w-[36rem] md:shrink-0 md:border-r md:border-border lg:w-[40rem]', view === 'mapa' ? 'shrink-0' : 'flex-1')}>
        {/* Cabecera fija de la columna */}
        <header className="shrink-0 space-y-3 border-b border-border bg-background px-4 pb-3 pt-4 md:px-6 md:pt-6">
          {/* En móvil el título no aporta (ya lo dice la pestaña) y el alto es para el plan:
              se añade con el «+» flotante o con «Añadir» en cada día. */}
          <div className="hidden items-center justify-between gap-3 md:flex">
            <div className="min-w-0">
              <h1 className="title-page">Plan</h1>
              {days && activities && (
                <p className="text-sm text-muted-foreground">
                  {days.length} {days.length === 1 ? 'día' : 'días'} · {activities.length} {activities.length === 1 ? 'actividad' : 'actividades'}
                  {elapsed > 0 && ` · vas por el día ${elapsed}`}
                </p>
              )}
            </div>
            {editMode && (
              <Button variant="primary" onClick={() => navigate(`/trips/${tripId}/itinerary/new`)}>
                <Plus /> Añadir actividad
              </Button>
            )}
          </div>
          
          <Segmented<View>
            label="Vista del plan" block value={view} onChange={setView}
            options={[
              { value: 'dias', label: 'Días', icon: CalendarRange },
              { value: 'ideas', label: 'Ideas', icon: Lightbulb },
              ...(mobile ? [{ value: 'mapa' as const, label: 'Mapa', icon: MapIcon }] : []),
            ]}
          />

          {view === 'dias' && (days?.length ?? 0) > 0 && (
            <>
              {/* Herramientas del plan, cada una con su nombre */}
              <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
                {canEdit && (
                  <Segmented
                    label="Modo del plan" size="sm" value={editMode ? 'edit' : 'view'}
                    onChange={v => plan.setMode(v)}
                    options={[{ value: 'edit', label: 'Editar', icon: Pencil }, { value: 'view', label: 'Solo ver', icon: Eye }]}
                  />
                )}
                <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)}><Layers /> Versiones</Button>
                {canEdit && plan.transitDrivingTotal > 0 && (
                  <Button
                    variant="outline" size="sm"
                    title={plan.transitPendingTotal > 0 ? `${plan.transitPendingTotal} trayectos en coche sin ruta` : 'Volver a pedir las rutas de todo el viaje'}
                    onClick={() => plan.setTransitScope({ dayIds: days!.map(d => d.id), label: 'en todo el viaje' })}
                  >
                    <TrainFront /> Transporte público
                  </Button>
                )}
                {plan.hasRoute && (
                  <Button variant="outline" size="sm" onClick={() => {
                      // El mapa dibuja el recorrido de todo el viaje al recibir ?route=1 (lo consume él).
                      const next = new URLSearchParams(searchParams)
                      next.set('route', '1')
                      if (mobile) { next.delete('tab'); next.set('vista', 'mapa') }
                      setSearchParams(next)
                    }}>
                    <Route /> Ver recorrido
                  </Button>
                )}
              </div>

              {/* Tira de días: salta a uno y dibuja su recorrido en el mapa */}
              <nav aria-label="Ir a un día" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:-mx-6 md:px-6">
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
                        'flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border leading-none transition-colors',
                        selected ? 'border-primary bg-primary text-primary-foreground shadow-card'
                          : today ? 'border-primary bg-primary-soft text-accent-foreground'
                            : 'border-border bg-card hover:bg-secondary',
                      )}
                    >
                      <span className="text-2xs font-semibold uppercase opacity-70">{format(date, 'EEEEE', { locale: es })}</span>
                      <span className="mt-1 text-base font-semibold tabular-nums">{format(date, 'd')}</span>
                    </button>
                  )
                })}
                <Button variant="ghost" size="sm" className="ml-auto shrink-0 self-center" onClick={plan.toggleAllDays}>
                  {plan.allDaysCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
                  {plan.allDaysCollapsed ? 'Desplegar' : 'Plegar'} todo
                </Button>
              </nav>
            </>
          )}
        </header>

        {/* Contenido con scroll propio */}
        {view !== 'mapa' && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-2 md:px-6 md:pb-10">
            {view === 'ideas' ? (
              <IdeasList tripId={tripId} />
            ) : plan.loading ? (
              <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
            ) : !days?.length ? (
              <Empty icon={CalendarRange} title="Preparando los días…" description="Estamos creando un día por cada fecha del viaje." />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={plan.handleDragEnd}>
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
          <PlanMap tripId={tripId} />
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
