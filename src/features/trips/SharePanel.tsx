import { Panel } from '@/design'
import { useTrip } from '@/lib/queries/trips'
import { useUiStore } from '@/shell/uiStore'
import { Collaborators } from './Collaborators'

/** Panel «Compartir viaje». Lo abre `useUiStore().openShare(tripId)`; se monta una vez en el armazón. */
export default function SharePanel() {
  const tripId = useUiStore(s => s.shareTripId)
  const close = useUiStore(s => s.closeShare)
  const { data: trip } = useTrip(tripId ?? '')
  return (
    <Panel
      open={!!tripId}
      onOpenChange={o => { if (!o) close() }}
      title="Compartir viaje"
      description={trip ? `Quien invites verá «${trip.name}» en su Wanderlog.` : undefined}
    >
      {tripId && <Collaborators tripId={tripId} />}
    </Panel>
  )
}
