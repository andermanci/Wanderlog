import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, QrCode } from 'lucide-react'
import { DocIcon } from '@/design'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useDocuments } from '@/lib/queries/documents'
import { ACTIVITY_TO_CATEGORY, buildAttachmentPass, buildDocPass } from '@/lib/wallet/pass'
import { useWalletPassStore } from '@/store/walletPassStore'
import type { Activity } from '@/types/database'
import { toneOf } from './shared'

interface TodayTicketsProps {
  tripId: string
  /** Hoy, en formato YYYY-MM-DD. */
  todayStr: string
  todayActs: Activity[]
  /** El alojamiento de esta noche (todayActs no incluye los hoteles). */
  lodgingActivityId?: string
}

function TicketButton({ category, title, hasCode, onClick }: { category: string; title: string; hasCode: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasCode ? `Mostrar el código de ${title}` : `Ver ${title} en la cartera`}
      className="flex h-14 max-w-68 shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-card pl-2.5 pr-3.5 text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-raised active:scale-[0.98]"
    >
      <span data-tone={toneOf(category)} className="grid size-9 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
        <DocIcon category={category} className="size-[1.125rem]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {hasCode
            ? <><QrCode className="size-3.5" aria-hidden="true" /> Mostrar código</>
            : <>Ver en la cartera <ChevronRight className="size-3.5" aria-hidden="true" /></>}
        </span>
      </span>
    </button>
  )
}

// «Billetes de hoy»: lo que vas a tener que enseñar durante el día, a un toque
// desde Inicio. Solo criterios seguros: adjuntos de las actividades de hoy y
// reservas cuya fecha (o estancia, en hoteles) cae hoy. Si no hay nada, no pinta nada.
export function TodayTickets({ tripId, todayStr, todayActs, lodgingActivityId }: TodayTicketsProps) {
  const navigate = useNavigate()
  const openPass = useWalletPassStore(s => s.openPass)
  const { data: attachments } = useTripAttachments(tripId)
  const { data: documents } = useDocuments(tripId)

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

  return (
    <section aria-label="Billetes de hoy" className="space-y-2">
      <h2 className="eyebrow px-1">Billetes de hoy</h2>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {todayDocs.map(doc => {
          const pass = buildDocPass(doc)
          return (
            <TicketButton
              key={`doc-${doc.id}`}
              category={doc.category}
              title={doc.title}
              hasCode={!!pass}
              onClick={() => (pass ? openPass(pass) : navigate(`/trips/${tripId}/documents?doc=${doc.id}`))}
            />
          )
        })}
        {todayAttachments.map(att => {
          const activity = todayActs.find(a => a.id === att.activity_id)
          return (
            <TicketButton
              key={`att-${att.id}`}
              category={ACTIVITY_TO_CATEGORY[activity?.type ?? 'other'] ?? 'other'}
              title={att.name}
              hasCode
              onClick={() => openPass(buildAttachmentPass(att, activity))}
            />
          )
        })}
      </div>
    </section>
  )
}
