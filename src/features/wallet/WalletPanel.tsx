import { useState, type ReactNode } from 'react'
import { CalendarPlus, FileQuestion, IdCard, ShieldCheck, Ticket, UserPlus } from 'lucide-react'
import { Empty, Panel, Row, RowList } from '@/design'
import { DOCUMENT_LABELS } from '@/lib/utils'
import type { Activity, ActivityAttachment, Document, Traveler } from '@/types/database'
import { AttachmentDetail } from './AttachmentDetail'
import { BookingDetail } from './BookingDetail'
import { BookingForm, type BookingCategory } from './BookingForm'
import { FooterSlotContext } from './footerSlot'
import { IcsImport } from './IcsImport'
import { PersonalDocForm } from './PersonalDocForm'
import { TravelerForm } from './TravelerForm'
import type { FileRef } from './shared'

/** Lo que enseña el panel. `from` es el paso anterior, al que vuelve la flecha «atrás». */
export type WalletView =
  | { kind: 'add' }
  | { kind: 'booking-form'; docId?: string; category?: BookingCategory; from?: WalletView }
  | { kind: 'personal-form'; docId?: string; travelerId?: string; from?: WalletView }
  | { kind: 'traveler-form'; from?: WalletView }
  | { kind: 'ics'; from?: WalletView }
  | { kind: 'booking'; docId: string }
  | { kind: 'attachment'; attId: string }

interface WalletPanelProps {
  tripId: string
  open: boolean
  view: WalletView
  canEdit: boolean
  documents: Document[]
  attachments: ActivityAttachment[]
  activities: Activity[]
  travelers: Traveler[]
  onView: (view: WalletView) => void
  onClose: () => void
  onOpenFile: (file: FileRef) => void
  onDeleteDoc: (doc: Document) => void
  onDeleteAttachment: (att: ActivityAttachment) => void
}

const Gone = () => (
  <Empty bare icon={FileQuestion} title="Ya no está" description="Puede que alguien lo haya eliminado. Cierra y vuelve a mirar la lista." />
)

// Un único panel para toda la cartera: elegir qué añadir, los formularios, el
// detalle y la importación. Cambia de contenido sin cerrarse; nunca se anida.
export function WalletPanel({
  tripId, open, view, canEdit, documents, attachments, activities, travelers,
  onView, onClose, onOpenFile, onDeleteDoc, onDeleteAttachment,
}: WalletPanelProps) {
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null)
  const back = 'from' in view && view.from ? () => onView(view.from!) : undefined
  // Al terminar o cancelar un paso: se vuelve al anterior si lo hay; si no, se cierra.
  const done = back ?? onClose

  let title: ReactNode = ''
  let description: ReactNode
  let body: ReactNode = null
  let footer = true

  switch (view.kind) {
    case 'add': {
      title = 'Añadir a la cartera'
      description = '¿Qué quieres guardar?'
      footer = false
      const go = (next: WalletView) => () => onView({ ...next, from: view } as WalletView)
      body = (
        <RowList>
          <Row icon={Ticket} tone="flight" title="Billete o reserva" subtitle="Vuelos, trenes, hoteles, entradas…" chevron
            onClick={go({ kind: 'booking-form' })} />
          <Row icon={IdCard} tone="primary" title="Documento personal" subtitle="DNI, pasaporte, visado, vacunas…" chevron
            onClick={go({ kind: 'personal-form' })} />
          <Row icon={ShieldCheck} tone="info" title="Seguro de viaje" subtitle="Póliza y teléfono de asistencia" chevron
            onClick={go({ kind: 'booking-form', category: 'insurance' })} />
          <Row icon={UserPlus} tone="success" title="Viajero" subtitle="Una persona que viene al viaje" chevron
            onClick={go({ kind: 'traveler-form' })} />
          <Row icon={CalendarPlus} tone="neutral" title="Importar un archivo .ics" subtitle="El de la aerolínea o el hotel" chevron
            onClick={go({ kind: 'ics' })} />
        </RowList>
      )
      break
    }
    case 'booking-form': {
      const doc = view.docId ? documents.find(d => d.id === view.docId) : undefined
      const insurance = (doc?.category ?? view.category) === 'insurance'
      title = doc ? (insurance ? 'Editar seguro' : 'Editar reserva') : insurance ? 'Nuevo seguro' : 'Nuevo billete o reserva'
      if (view.docId && !doc) { body = <Gone />; footer = false; break }
      body = (
        <BookingForm
          key={doc?.id ?? `nuevo-${view.category ?? 'other'}`}
          tripId={tripId}
          doc={doc}
          category={view.category}
          onSaved={doc ? done : onClose}
          onCancel={done}
        />
      )
      break
    }
    case 'personal-form': {
      const doc = view.docId ? documents.find(d => d.id === view.docId) : undefined
      title = doc ? `Editar ${DOCUMENT_LABELS[doc.category] ?? 'documento'}` : 'Nuevo documento personal'
      if (view.docId && !doc) { body = <Gone />; footer = false; break }
      body = (
        <PersonalDocForm
          key={doc?.id ?? 'nuevo'}
          tripId={tripId}
          doc={doc}
          travelerId={view.travelerId}
          travelers={travelers}
          onSaved={doc ? done : onClose}
          onCancel={done}
          onAddTraveler={() => onView({ kind: 'traveler-form', from: view })}
        />
      )
      break
    }
    case 'traveler-form':
      title = 'Añadir viajero'
      // Si se vino desde el formulario de un documento, se vuelve a él; si no, se cierra.
      body = <TravelerForm tripId={tripId} onSaved={view.from?.kind === 'personal-form' ? done : onClose} onCancel={done} />
      break
    case 'ics':
      title = 'Importar .ics'
      description = 'Trae tus reservas desde el archivo de calendario.'
      body = <IcsImport tripId={tripId} onDone={onClose} onCancel={done} />
      break
    case 'booking': {
      const doc = documents.find(d => d.id === view.docId)
      if (!doc) { title = 'Reserva'; body = <Gone />; footer = false; break }
      title = doc.title
      description = DOCUMENT_LABELS[doc.category] ?? 'Documento'
      footer = canEdit
      body = (
        <BookingDetail
          tripId={tripId}
          doc={doc}
          canEdit={canEdit}
          onEdit={() => onView({ kind: 'booking-form', docId: doc.id, from: view })}
          onDelete={() => onDeleteDoc(doc)}
          onOpenFile={onOpenFile}
        />
      )
      break
    }
    case 'attachment': {
      const att = attachments.find(a => a.id === view.attId)
      if (!att) { title = 'Adjunto'; body = <Gone />; footer = false; break }
      title = att.name
      description = 'Archivo adjunto a una actividad'
      footer = canEdit
      body = (
        <AttachmentDetail
          tripId={tripId}
          att={att}
          activity={activities.find(a => a.id === att.activity_id)}
          canEdit={canEdit}
          onDelete={() => onDeleteAttachment(att)}
          onOpenFile={onOpenFile}
        />
      )
      break
    }
  }

  return (
    <Panel
      open={open}
      onOpenChange={o => !o && onClose()}
      title={title}
      description={description}
      onBack={back}
      footer={footer
        ? <div ref={setFooterSlot} className="contents [&>*]:flex-1 md:[&>*]:flex-none" />
        : undefined}
    >
      <FooterSlotContext.Provider value={footerSlot}>
        {body}
      </FooterSlotContext.Provider>
    </Panel>
  )
}
