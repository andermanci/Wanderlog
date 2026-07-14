import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket, FileText } from 'lucide-react'
import { DocIcon } from '@/components/icons/DocIcon'
import { DocLightbox } from '@/components/documents/DocLightbox'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useDocuments } from '@/lib/queries/documents'
import type { Activity } from '@/types/database'

interface TodayDocsRowProps {
  tripId: string
  todayStr: string
  todayActs: Activity[]
  /** El alojamiento de esta noche (todayActs excluye hoteles). */
  lodgingActivityId?: string
}

// "Para hoy": los billetes/reservas/adjuntos que vas a necesitar durante la
// jornada, a un tap desde el centro del día — sin bucear en Documentos.
// Solo criterios deterministas: adjuntos de las actividades de hoy y
// documentos cuya fecha (o estancia, en hoteles) cae hoy.
export function TodayDocsRow({ tripId, todayStr, todayActs, lodgingActivityId }: TodayDocsRowProps) {
  const navigate = useNavigate()
  const { data: attachments } = useTripAttachments(tripId)
  const { data: documents } = useDocuments(tripId)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const todayAttachments = useMemo(() => {
    const ids = new Set(todayActs.map(a => a.id))
    if (lodgingActivityId) ids.add(lodgingActivityId)
    return (attachments ?? []).filter(att => att.activity_id && ids.has(att.activity_id))
  }, [attachments, todayActs, lodgingActivityId])

  const todayDocs = useMemo(() => (documents ?? []).filter(d => {
    const start = d.datetime_start?.slice(0, 10)
    if (!start) return false
    if (start === todayStr) return true
    // Hotel cuya estancia cubre esta noche (entrada <= hoy < salida).
    const end = d.datetime_end?.slice(0, 10)
    return d.category === 'hotel' && !!end && start <= todayStr && todayStr < end
  }), [documents, todayStr])

  if (todayAttachments.length === 0 && todayDocs.length === 0) return null

  const isImage = (url: string, mime?: string | null) =>
    mime?.startsWith('image/') ?? /\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(url)

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5 px-1">
        <Ticket size={14} style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-medium">Para hoy</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 [scrollbar-width:none]">
        {todayDocs.map(doc => (
          <button
            key={`doc-${doc.id}`}
            type="button"
            onClick={() => {
              if (doc.file_url) setLightbox({ url: doc.file_url, name: doc.title })
              else if (doc.link) window.open(doc.link, '_blank', 'noreferrer')
              else navigate(`/trips/${tripId}/documents`)
            }}
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-md border border-border flex-shrink-0 hover:border-primary transition-colors"
            style={{ background: 'var(--card)' }}
          >
            <DocIcon category={doc.category} size={14} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
            <span className="text-xs truncate max-w-[150px]">{doc.title}</span>
          </button>
        ))}
        {todayAttachments.map(att => (
          <button
            key={`att-${att.id}`}
            type="button"
            title={att.name}
            onClick={() => setLightbox({ url: att.file_url, name: att.name })}
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-md border border-border flex-shrink-0 hover:border-primary transition-colors"
            style={{ background: 'var(--card)' }}
          >
            {isImage(att.file_url, att.mime) ? (
              <img src={att.file_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
            ) : (
              <FileText size={14} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
            )}
            <span className="text-xs truncate max-w-[150px]">{att.name}</span>
          </button>
        ))}
      </div>

      <DocLightbox
        open={!!lightbox}
        onOpenChange={(o) => { if (!o) setLightbox(null) }}
        url={lightbox?.url ?? null}
        name={lightbox?.name ?? ''}
      />
    </div>
  )
}
