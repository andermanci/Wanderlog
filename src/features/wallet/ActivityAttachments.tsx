import { useRef, useState } from 'react'
import { Eye, FileText, QrCode, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Confirm, Menu } from '@/design'
import {
  uploadAttachmentFile, useAddAttachment, useDeleteAttachment, useTripAttachments,
} from '@/lib/queries/attachments'
import { useActivities } from '@/lib/queries/itinerary'
import { buildAttachmentPass } from '@/lib/wallet/pass'
import { useAuthStore } from '@/store/authStore'
import { useWalletPassStore } from '@/store/walletPassStore'
import type { ActivityAttachment } from '@/types/database'
import { FileViewer } from './FileViewer'
import { isImageRef, type FileRef } from './shared'
import { useDisclosure } from './useDisclosure'

const MAX_BYTES = 10 * 1024 * 1024

interface ActivityAttachmentsProps {
  tripId: string
  activityId: string
  canEdit: boolean
}

// Entradas y documentos adjuntos a una actividad: subir, ver, enseñar el código
// a pantalla completa y eliminar. Pensado para ir dentro del detalle de la actividad.
export function ActivityAttachments({ tripId, activityId, canEdit }: ActivityAttachmentsProps) {
  const user = useAuthStore(s => s.user)
  const openPass = useWalletPassStore(s => s.openPass)
  const { data: tripAttachments } = useTripAttachments(tripId)
  const { data: activities } = useActivities(tripId)
  const addAttachment = useAddAttachment(tripId, activityId)
  const deleteAttachment = useDeleteAttachment(tripId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const viewer = useDisclosure<FileRef>()
  const deletion = useDisclosure<ActivityAttachment>()

  const activity = activities?.find(a => a.id === activityId)
  const attachments = (tripAttachments ?? []).filter(a => a.activity_id === activityId)

  async function upload(file: File) {
    if (!user) return
    if (file.size > MAX_BYTES) { toast.error('El archivo pesa más de 10 MB'); return }
    setUploading(true)
    try {
      const url = await uploadAttachmentFile(file, user.id, tripId, activityId)
      await addAttachment.mutateAsync({ name: file.name, file_url: url, mime: file.type || null })
    } catch {
      toast.error('No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  if (!canEdit && attachments.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h3 className="title-card">Entradas y documentos</h3>
        <p className="text-sm text-muted-foreground">
          {attachments.length === 0
            ? 'Sube aquí la entrada o el billete de esta actividad (PDF o imagen, hasta 10 MB) para enseñarlo desde el móvil.'
            : 'Toca «Mostrar código» para enseñarlo a pantalla completa.'}
        </p>
      </div>

      {attachments.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {attachments.map(att => {
            const file: FileRef = { url: att.file_url, name: att.name, mime: att.mime }
            return (
              <li key={att.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
                <button
                  type="button"
                  onClick={() => viewer.show(file)}
                  aria-label={`Ver ${att.name}`}
                  className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken text-muted-foreground"
                >
                  {isImageRef(att.file_url, att.mime)
                    ? <img src={att.file_url} alt="" className="size-full object-cover" />
                    : <FileText className="size-5" aria-hidden="true" />}
                </button>
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{att.name}</span>
                <span className="flex items-center gap-1">
                  <Button variant="soft" size="sm" className="h-11 md:h-9" onClick={() => openPass(buildAttachmentPass(att, activity))}>
                    <QrCode /> Mostrar código
                  </Button>
                  <Menu
                    label={`Opciones de ${att.name}`}
                    triggerSize="md"
                    items={[
                      { label: 'Ver archivo', icon: Eye, onSelect: () => viewer.show(file) },
                      canEdit && { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => deletion.show(att) },
                    ]}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            aria-label="Archivo para adjuntar"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }}
          />
          <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            {!uploading && <Upload />} {uploading ? 'Subiendo…' : 'Subir entrada o documento'}
          </Button>
        </>
      )}

      <FileViewer open={viewer.open} file={viewer.value} onClose={viewer.hide} />
      <Confirm
        danger
        open={deletion.open && !!deletion.value}
        onOpenChange={o => !o && deletion.hide()}
        title="¿Eliminar este adjunto?"
        description={deletion.value ? `Se borrará «${deletion.value.name}» de esta actividad y de la cartera.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deletion.value) deleteAttachment.mutate(deletion.value.id)
          deletion.hide()
        }}
      />
    </section>
  )
}
