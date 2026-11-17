import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileQuestion, Pencil, Trash2 } from 'lucide-react'
import { Button, Confirm, Empty, Menu, Notice, Panel, Skeleton } from '@/design'
import { useDocuments } from '@/lib/queries/documents'
import { useActivities, useDeleteActivity, useItineraryDays } from '@/lib/queries/itinerary'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { ActivityDetail } from './ActivityDetail'
import { ActivityForm, type PickTarget } from './ActivityForm'
import { FooterSlotContext } from './footerSlot'

interface ActivityPanelProps {
  tripId: string
  /** 'detail' = ver · 'edit' = editar · 'new' = crear */
  mode: 'detail' | 'edit' | 'new'
  /** En detail y edit. */
  activityId?: string
  /** En new: día preseleccionado (viene de ?day=). */
  defaultDayId?: string
  /** Cerrar el panel (quien lo monta navega de vuelta al Plan). */
  onClose: () => void
}

const PICK_TITLES: Record<PickTarget, string> = {
  address: '¿Dónde es?',
  origin: '¿De dónde sale?',
  destination: '¿A dónde llega?',
}

/**
 * Ver, crear y editar una actividad, en UN solo panel sobre el Plan. Cambiar de
 * modo es navegar (cada modo tiene su URL); los pasos intermedios («cómo
 * llegar», «elegir ubicación») cambian el contenido del mismo panel y vuelven
 * con la flecha «atrás».
 *
 * Tiene que montarse dentro del `<APIProvider>` de Google Maps del Plan.
 */
export function ActivityPanel({ tripId, mode, activityId, defaultDayId, onClose }: ActivityPanelProps) {
  const navigate = useNavigate()
  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId)
  const { data: documents, isLoading: loadingDocs } = useDocuments(tripId)
  const { data: role, isLoading: loadingRole } = useTripRole(tripId)
  const deleteActivity = useDeleteActivity()
  const canEdit = canEditRole(role)

  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Pasos dentro del panel: «cómo llegar» (al ver) y «elegir ubicación» (al editar).
  const [directions, setDirections] = useState(false)
  const [pick, setPick] = useState<PickTarget | null>(null)

  // Al cambiar de actividad o de modo se empieza siempre por el contenido principal.
  const viewKey = `${mode}:${activityId ?? ''}`
  const [lastKey, setLastKey] = useState(viewKey)
  if (lastKey !== viewKey) {
    setLastKey(viewKey)
    setDirections(false)
    setPick(null)
    setConfirmDelete(false)
  }

  const activity = activityId ? activities?.find(a => a.id === activityId) ?? null : null
  const linkedDoc = activityId ? documents?.find(d => d.activity_id === activityId) ?? null : null
  const isForm = mode !== 'detail'
  // El formulario espera también a los documentos: precarga la reserva vinculada.
  const loading = loadingDays || loadingActs || (isForm && (loadingDocs || loadingRole))
  const missing = !loading && mode !== 'new' && !activity
  const formReady = isForm && !loading && !missing && canEdit

  const planUrl = (dayId?: string | null) => `/trips/${tripId}/itinerary${dayId ? `?day=${dayId}` : ''}`
  const detailUrl = (id: string) => `/trips/${tripId}/itinerary/${id}`

  let title: ReactNode
  let description: ReactNode
  let onBack: (() => void) | undefined
  let actions: ReactNode
  let body: ReactNode

  if (loading) {
    title = mode === 'new' ? 'Añadir al plan' : mode === 'edit' ? 'Editar' : 'Actividad'
    body = (
      <div className="space-y-4" role="status" aria-label="Cargando">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    )
  } else if (missing) {
    title = 'Actividad'
    body = (
      <Empty bare icon={FileQuestion} title="Esta actividad ya no está" description="Puede que alguien la haya eliminado del plan.">
        <Button variant="primary" onClick={onClose}>Volver al plan</Button>
      </Empty>
    )
  } else if (isForm) {
    if (pick) {
      title = PICK_TITLES[pick]
      description = 'Busca el sitio o márcalo en el mapa.'
      onBack = () => setPick(null)
    } else if (mode === 'edit') {
      title = 'Editar'
      description = activity?.title
      onBack = () => navigate(detailUrl(activity!.id))
    } else {
      title = 'Añadir al plan'
      description = 'Con el nombre y el día ya vale. Lo demás lo puedes completar luego.'
    }
    body = canEdit ? (
      <ActivityForm
        key={activityId ?? 'new'}
        tripId={tripId}
        days={days ?? []}
        activity={activity}
        linkedDoc={linkedDoc}
        defaultDayId={defaultDayId}
        pick={pick}
        onPick={setPick}
        onCancel={() => (activity ? navigate(detailUrl(activity.id)) : onClose())}
        onSaved={(id, dayId) => navigate(activity ? detailUrl(id) : planUrl(dayId), { replace: true })}
      />
    ) : (
      <Notice tone="info" title="Solo puedes ver este viaje">
        Para cambiar el plan, pide a quien te lo compartió que te deje editarlo.
      </Notice>
    )
  } else if (activity) {
    if (directions) {
      title = 'Cómo llegar'
      description = activity.title
      onBack = () => setDirections(false)
    } else {
      // El título largo se lee entero: salta de línea en vez de cortarse.
      title = <span className="block whitespace-normal break-words">{activity.title}</span>
      actions = canEdit && (
        <>
          <Button variant="outline" size="sm" className="mt-0.5" onClick={() => navigate(`${detailUrl(activity.id)}/edit`)}>
            <Pencil /> Editar
          </Button>
          <span className="mt-0.5">
            <Menu
              label="Más opciones de la actividad"
              triggerVariant="secondary"
              items={[{ label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) }]}
            />
          </span>
        </>
      )
    }
    body = (
      <ActivityDetail
        tripId={tripId}
        activity={activity}
        days={days ?? []}
        activities={activities ?? []}
        linkedDoc={linkedDoc}
        canEdit={canEdit}
        directions={directions}
        onDirections={setDirections}
        onClose={onClose}
      />
    )
  }

  return (
    <>
      <Panel
        open
        size="lg"
        onOpenChange={o => { if (!o) onClose() }}
        title={title}
        description={description}
        onBack={onBack}
        actions={actions}
        footer={formReady
          ? <div ref={setFooterSlot} className="flex items-center justify-end gap-2 [&>*]:flex-1 md:[&>*]:flex-none" />
          : undefined}
      >
        <FooterSlotContext.Provider value={footerSlot}>
          {body}
        </FooterSlotContext.Provider>
      </Panel>

      <Confirm
        danger
        open={confirmDelete && !!activity}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar esta actividad?"
        description={<>Se quitará <strong>{activity?.title}</strong> del plan, con sus archivos adjuntos. No se puede deshacer.</>}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (!activity) return
          deleteActivity.mutate({ id: activity.id, tripId })
          setConfirmDelete(false)
          navigate(planUrl(activity.day_id), { replace: true })
        }}
      />
    </>
  )
}
