import { Link } from 'react-router-dom'
import { Eye, QrCode, Trash2 } from 'lucide-react'
import { Button, Card } from '@/design'
import { buildAttachmentPass } from '@/lib/wallet/pass'
import { useWalletPassStore } from '@/store/walletPassStore'
import type { Activity, ActivityAttachment } from '@/types/database'
import { DocImage } from './DocImage'
import { PanelFooter } from './PanelSlots'
import { isImageRef, type FileRef } from './shared'

interface AttachmentDetailProps {
  tripId: string
  att: ActivityAttachment
  activity?: Activity
  canEdit: boolean
  onDelete: () => void
  onOpenFile: (file: FileRef) => void
}

// Detalle de un archivo que se adjuntó a una actividad del plan.
export function AttachmentDetail({ tripId, att, activity, canEdit, onDelete, onOpenFile }: AttachmentDetailProps) {
  const openPass = useWalletPassStore(s => s.openPass)
  const file: FileRef = { url: att.file_url, name: att.name, mime: att.mime }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Button variant="primary" size="lg" block onClick={() => openPass(buildAttachmentPass(att, activity))}>
          <QrCode /> Mostrar código
        </Button>
        {isImageRef(att.file_url, att.mime) && (
          <button
            type="button"
            onClick={() => onOpenFile(file)}
            className="block w-full overflow-hidden rounded-xl border border-border"
            aria-label="Ver el archivo en grande"
          >
            <DocImage src={att.file_url} alt={att.name} className="max-h-56 w-full object-cover" />
          </button>
        )}
        <Button variant="outline" block onClick={() => onOpenFile(file)}><Eye /> Ver archivo</Button>
      </div>

      <Card sunken pad="sm" className="space-y-2">
        <p className="text-sm text-muted-foreground">Está adjunto a esta actividad del plan:</p>
        <p className="text-[0.9375rem] font-medium">{activity?.title ?? 'Actividad'}</p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/trips/${tripId}/itinerary/${att.activity_id}`}>Ver la actividad</Link>
        </Button>
      </Card>

      {canEdit && (
        <PanelFooter>
          <Button variant="danger-ghost" onClick={onDelete}><Trash2 /> Eliminar</Button>
        </PanelFooter>
      )}
    </div>
  )
}
