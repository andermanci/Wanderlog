import { Confirm } from '@/design'
import { useDeleteAttachment } from '@/lib/queries/attachments'
import { useDeleteDocument } from '@/lib/queries/documents'
import { useDeleteTraveler } from '@/lib/queries/travelers'
import type { ActivityAttachment, Document, Traveler } from '@/types/database'

export type DeleteTarget =
  | { kind: 'doc'; doc: Document }
  | { kind: 'attachment'; att: ActivityAttachment }
  | { kind: 'traveler'; traveler: Traveler }

interface DeleteConfirmProps {
  tripId: string
  open: boolean
  target: DeleteTarget | null
  onClose: () => void
  /** Se llama al confirmar, para cerrar el panel que lo estuviera enseñando. */
  onConfirmed: (target: DeleteTarget) => void
}

const COPY: Record<DeleteTarget['kind'], string> = {
  doc: '¿Eliminar este documento?',
  attachment: '¿Eliminar este adjunto?',
  traveler: '¿Eliminar a este viajero?',
}

// La pregunta antes de borrar un documento, un adjunto o un viajero.
export function DeleteConfirm({ tripId, open, target, onClose, onConfirmed }: DeleteConfirmProps) {
  const deleteDoc = useDeleteDocument()
  const deleteAttachment = useDeleteAttachment(tripId)
  const deleteTraveler = useDeleteTraveler()

  function confirm() {
    if (!target) return
    if (target.kind === 'doc') deleteDoc.mutate({ id: target.doc.id, tripId, activityId: target.doc.activity_id })
    else if (target.kind === 'attachment') deleteAttachment.mutate(target.att.id)
    else deleteTraveler.mutate({ id: target.traveler.id, tripId })
    onConfirmed(target)
    onClose()
  }

  let description = ''
  if (target?.kind === 'doc') {
    description = `Se borrará «${target.doc.title}» de la cartera.`
      + (target.doc.activity_id ? ' También se quitará su parada del plan.' : '')
  } else if (target?.kind === 'attachment') {
    description = `Se borrará «${target.att.name}», también de la actividad a la que está adjunto.`
  } else if (target?.kind === 'traveler') {
    description = `Se quitará a ${target.traveler.name} del viaje. Sus documentos no se borran: quedan sin asignar.`
  }

  return (
    <Confirm
      danger
      open={open && !!target}
      onOpenChange={o => !o && onClose()}
      title={target ? COPY[target.kind] : ''}
      description={description}
      confirmLabel="Eliminar"
      onConfirm={confirm}
    />
  )
}
