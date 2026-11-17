import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Notice, Page, Skeleton, Stack } from '@/design'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useDocuments } from '@/lib/queries/documents'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { useTravelers } from '@/lib/queries/travelers'
import { DOCUMENT_LABELS, isFileDoc } from '@/lib/utils'
import type { Document } from '@/types/database'
import { DeleteConfirm, type DeleteTarget } from './DeleteConfirm'
import { FileViewer } from './FileViewer'
import { IdCardViewer } from './IdCardViewer'
import { InsuranceSection } from './InsuranceSection'
import { PersonalSection } from './PersonalSection'
import { TicketsSection } from './TicketsSection'
import { TravelersSection } from './TravelersSection'
import { WalletPanel, type WalletView } from './WalletPanel'
import { buildTickets, isIdentity, isPersonal, type FileRef, type IdCardRef, type TicketItem } from './shared'
import { useDisclosure } from './useDisclosure'

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`

// Cartera del viaje: billetes y reservas, documentación personal, seguros y viajeros.
export function WalletPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const [params, setParams] = useSearchParams()
  const { data: role, isLoading: roleLoading } = useTripRole(tripId)
  const canEdit = canEditRole(role)
  const { data: documents, isLoading } = useDocuments(tripId)
  const { data: travelers } = useTravelers(tripId)
  const { data: attachments } = useTripAttachments(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: days } = useItineraryDays(tripId)

  // «Ahora» se fija al abrir la pantalla: decide qué es hoy, qué pasó y qué caduca.
  const [now] = useState(() => new Date())

  const panel = useDisclosure<WalletView>()
  const fileViewer = useDisclosure<FileRef>()
  const cardViewer = useDisclosure<IdCardRef>()
  const deletion = useDisclosure<DeleteTarget>()

  const docs = useMemo(() => documents ?? [], [documents])
  const people = useMemo(() => travelers ?? [], [travelers])
  const personalDocs = useMemo(() => docs.filter(isPersonal), [docs])
  const insuranceDocs = useMemo(() => docs.filter(d => d.category === 'insurance'), [docs])
  const tickets = useMemo(
    () => buildTickets(
      docs.filter(d => !isPersonal(d) && d.category !== 'insurance'),
      attachments ?? [], activities ?? [], days ?? [],
    ),
    [docs, attachments, activities, days],
  )

  // ---- Contratos de URL ----
  const showPanel = panel.show
  const showFile = fileViewer.show
  const showCard = cardViewer.show
  const wantsNew = params.get('nuevo') === '1'
  const wantedDoc = params.get('doc')

  // ?nuevo=1 → abre «Añadir» y limpia el parámetro.
  useEffect(() => {
    if (!wantsNew || roleLoading) return
    if (canEdit) showPanel({ kind: 'add' })
    setParams(prev => { const next = new URLSearchParams(prev); next.delete('nuevo'); return next }, { replace: true })
  }, [wantsNew, roleLoading, canEdit, showPanel, setParams])

  // ?doc=<id> → abre ese documento (el detalle, o el visor si es personal).
  useEffect(() => {
    if (!wantedDoc || !documents) return
    const doc = documents.find(d => d.id === wantedDoc)
    if (!doc) toast.error('Ese documento ya no está en la cartera')
    else if (!isPersonal(doc)) showPanel({ kind: 'booking', docId: doc.id })
    else {
      const owner = (travelers ?? []).find(t => t.id === doc.traveler_id)?.name
      const title = `${DOCUMENT_LABELS[doc.category] ?? 'Documento'}${owner ? ` de ${owner}` : ''}`
      if (!isFileDoc(doc.category)) showCard({ title, subtitle: doc.confirmation_number, front: doc.file_url, back: doc.back_url })
      else if (doc.file_url) showFile({ url: doc.file_url, name: title })
    }
    setParams(prev => { const next = new URLSearchParams(prev); next.delete('doc'); return next }, { replace: true })
  }, [wantedDoc, documents, travelers, showPanel, showCard, showFile, setParams])

  // ---- Avisos ----
  const withoutId = people.filter(t => !personalDocs.some(d => d.traveler_id === t.id && isIdentity(d)))
  const noIdAtAll = people.length === 0 && docs.length > 0 && !personalDocs.some(isIdentity)

  const openTicket = (item: TicketItem) =>
    panel.show(item.kind === 'doc' ? { kind: 'booking', docId: item.doc.id } : { kind: 'attachment', attId: item.att.id })
  const editPersonal = (doc: Document) => panel.show({ kind: 'personal-form', docId: doc.id })

  // Si se borra lo que el panel está enseñando, el panel se cierra.
  function onDeleted(target: DeleteTarget) {
    const view = panel.value
    if (!view) return
    const showing =
      (target.kind === 'doc' && 'docId' in view && view.docId === target.doc.id)
      || (target.kind === 'attachment' && view.kind === 'attachment' && view.attId === target.att.id)
    if (showing) panel.hide()
  }

  return (
    <Page
      title="Cartera"
      subtitle="Billetes, reservas y documentos del viaje, siempre a mano."
      actions={canEdit ? (
        <>
          <Button onClick={() => panel.show({ kind: 'ics' })}><CalendarPlus /> Importar .ics</Button>
          <Button variant="primary" onClick={() => panel.show({ kind: 'add' })}><Plus /> Añadir</Button>
        </>
      ) : undefined}
    >
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Cargando la cartera">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : (
        <Stack gap="lg">
          {(withoutId.length > 0 || noIdAtAll) && (
            <Notice
              tone="warning"
              icon={AlertTriangle}
              title="Falta DNI o pasaporte"
              action={canEdit
                ? <Button variant="outline" size="sm" onClick={() => panel.show({ kind: 'personal-form', travelerId: withoutId[0]?.id })}>Añadir</Button>
                : undefined}
            >
              {withoutId.length > 0
                ? `Aún no está guardado el de ${joinNames(withoutId.map(t => t.name))}.`
                : 'Aún no hay ningún DNI ni pasaporte guardado para este viaje.'}
            </Notice>
          )}

          <TicketsSection
            items={tickets}
            now={now}
            canEdit={canEdit}
            onOpen={openTicket}
            onAdd={() => panel.show({ kind: 'booking-form' })}
            onImport={() => panel.show({ kind: 'ics' })}
          />

          <PersonalSection
            travelers={people}
            docs={personalDocs}
            canEdit={canEdit}
            now={now}
            onViewCard={cardViewer.show}
            onOpenFile={fileViewer.show}
            onEdit={editPersonal}
            onDelete={doc => deletion.show({ kind: 'doc', doc })}
            onAdd={travelerId => panel.show({ kind: 'personal-form', travelerId })}
            onAddTraveler={() => panel.show({ kind: 'traveler-form' })}
          />

          <InsuranceSection
            docs={insuranceDocs}
            canEdit={canEdit}
            onOpen={doc => panel.show({ kind: 'booking', docId: doc.id })}
            onAdd={() => panel.show({ kind: 'booking-form', category: 'insurance' })}
          />

          <TravelersSection
            travelers={people}
            docs={personalDocs}
            canEdit={canEdit}
            onAdd={() => panel.show({ kind: 'traveler-form' })}
            onAddDoc={travelerId => panel.show({ kind: 'personal-form', travelerId })}
            onDelete={traveler => deletion.show({ kind: 'traveler', traveler })}
          />
        </Stack>
      )}

      {panel.value && (
        <WalletPanel
          tripId={tripId}
          open={panel.open}
          view={panel.value}
          canEdit={canEdit}
          documents={docs}
          attachments={attachments ?? []}
          activities={activities ?? []}
          travelers={people}
          onView={panel.show}
          onClose={panel.hide}
          onOpenFile={fileViewer.show}
          onDeleteDoc={doc => deletion.show({ kind: 'doc', doc })}
          onDeleteAttachment={att => deletion.show({ kind: 'attachment', att })}
        />
      )}

      <FileViewer open={fileViewer.open} file={fileViewer.value} onClose={fileViewer.hide} />
      <IdCardViewer open={cardViewer.open} card={cardViewer.value} onClose={cardViewer.hide} />
      <DeleteConfirm
        tripId={tripId}
        open={deletion.open}
        target={deletion.value}
        onClose={deletion.hide}
        onConfirmed={onDeleted}
      />
    </Page>
  )
}
