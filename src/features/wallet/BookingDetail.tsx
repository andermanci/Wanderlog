import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Armchair, Building2, CalendarClock, Clock, ExternalLink, Eye, Hash, MapPin, Pencil, Phone, Plane, QrCode,
  StickyNote, Trash2, type LucideIcon,
} from 'lucide-react'
import { Button, Card, Skeleton, SwitchRow } from '@/design'
import { useSyncReservation } from '@/lib/queries/reservationSync'
import { canShowInItinerary } from '@/lib/reservationLink'
import { buildDocPass } from '@/lib/wallet/pass'
import { useWalletPassStore } from '@/store/walletPassStore'
import type { Document } from '@/types/database'
import { DocImage } from './DocImage'
import { PanelFooter } from './PanelSlots'
import { isImageRef, whenLabel, type FileRef } from './shared'

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-[0.9375rem]">{children}</dd>
      </div>
    </div>
  )
}

interface BookingDetailProps {
  tripId: string
  doc: Document
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onOpenFile: (file: FileRef) => void
}

// Detalle de un billete, una reserva o un seguro: el código, los archivos y todos sus datos.
export function BookingDetail({ tripId, doc, canEdit, onEdit, onDelete, onOpenFile }: BookingDetailProps) {
  const openPass = useWalletPassStore(s => s.openPass)
  const sync = useSyncReservation(tripId)
  const pass = buildDocPass(doc)
  const isInsurance = doc.category === 'insurance'
  const when = whenLabel(doc.datetime_start, doc.datetime_end)
  const inPlan = !!doc.activity_id
  const canMirror = canShowInItinerary(doc.category)

  return (
    <div className="space-y-5">
      {/* Lo primero: enseñar el billete */}
      {(pass || doc.file_url || doc.back_url) && (
        <div className="space-y-2">
          {pass && (
            <Button variant="primary" size="lg" block onClick={() => openPass(pass)}>
              <QrCode /> Mostrar código
            </Button>
          )}
          {doc.file_url && isImageRef(doc.file_url) && (
            <button
              type="button"
              onClick={() => onOpenFile({ url: doc.file_url!, name: doc.title })}
              className="block w-full overflow-hidden rounded-xl border border-border"
              aria-label="Ver el archivo en grande"
            >
              <DocImage
                src={doc.file_url}
                alt={doc.title}
                className="max-h-56 w-full object-cover"
                fallback={<Skeleton className="h-40 w-full rounded-none" />}
              />
            </button>
          )}
          <div className="flex flex-wrap gap-2 [&>*]:flex-1">
            {doc.file_url && (
              <Button variant="outline" onClick={() => onOpenFile({ url: doc.file_url!, name: doc.title })}>
                <Eye /> {isInsurance ? 'Ver la póliza' : 'Ver archivo'}
              </Button>
            )}
            {doc.back_url && (
              <Button variant="outline" onClick={() => onOpenFile({ url: doc.back_url!, name: `${doc.title} (2)` })}>
                <Eye /> {isInsurance ? 'Ver las condiciones' : 'Ver segundo archivo'}
              </Button>
            )}
          </div>
        </div>
      )}

      <dl className="divide-y divide-border">
        {when && <Fact icon={Clock} label={isInsurance ? 'Cobertura' : 'Fecha y hora'}>{when}</Fact>}
        {doc.provider && <Fact icon={Building2} label={isInsurance ? 'Aseguradora' : 'Compañía'}>{doc.provider}</Fact>}
        {doc.flight_number && <Fact icon={Plane} label="Número de vuelo"><span className="font-mono">{doc.flight_number}</span></Fact>}
        {doc.locator && (
          <Fact icon={Hash} label="Localizador">
            <span className="font-mono text-base font-semibold tracking-wide">{doc.locator}</span>
          </Fact>
        )}
        {doc.confirmation_number && (
          <Fact icon={Hash} label={isInsurance ? 'N.º de póliza' : 'N.º de confirmación'}>
            <span className="font-mono">{doc.confirmation_number}</span>
          </Fact>
        )}
        {(doc.origin || doc.destination) && (
          <Fact icon={MapPin} label="Trayecto">
            {doc.origin}{doc.origin && doc.destination ? ' → ' : ''}{doc.destination}
          </Fact>
        )}
        {doc.seat && <Fact icon={Armchair} label="Asiento">{doc.seat}</Fact>}
        {doc.phone && (
          <Fact icon={Phone} label={isInsurance ? 'Teléfono de asistencia' : 'Teléfono'}>
            <a href={`tel:${doc.phone}`} className="font-medium text-accent-foreground underline-offset-4 hover:underline">{doc.phone}</a>
          </Fact>
        )}
        {doc.link && (
          <Fact icon={ExternalLink} label="Enlace de la reserva">
            <a href={doc.link} target="_blank" rel="noreferrer" className="break-all text-accent-foreground underline-offset-4 hover:underline">{doc.link}</a>
          </Fact>
        )}
        {doc.notes && <Fact icon={StickyNote} label="Notas"><p className="whitespace-pre-wrap leading-relaxed">{doc.notes}</p></Fact>}
      </dl>

      {/* En el plan: crea (o quita) la parada del itinerario enlazada a esta reserva */}
      {canMirror && (canEdit || inPlan) && (
        <Card sunken pad="sm" className="space-y-2">
          {canEdit ? (
            <SwitchRow
              label="Mostrar en el plan"
              description={
                !doc.datetime_start ? 'Ponle antes una fecha (en «Editar») para colocarla en el plan.'
                  : inPlan ? 'Sale como una parada el día de la reserva.'
                    : 'La añadimos como parada el día de la reserva. Si la fecha cae fuera del viaje, no se añade.'
              }
              checked={inPlan}
              disabled={sync.isPending || (!doc.datetime_start && !inPlan)}
              onCheckedChange={v => sync.mutate({ doc, showInItinerary: v })}
            />
          ) : (
            <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
              <CalendarClock className="size-[1.125rem] text-muted-foreground" aria-hidden="true" /> Está en el plan del viaje
            </p>
          )}
          {inPlan && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/trips/${tripId}/itinerary/${doc.activity_id}`}>Ver en el plan</Link>
            </Button>
          )}
        </Card>
      )}

      {canEdit && (
        <PanelFooter>
          <Button variant="danger-ghost" onClick={onDelete}><Trash2 /> Eliminar</Button>
          <Button variant="secondary" onClick={onEdit}><Pencil /> Editar</Button>
        </PanelFooter>
      )}
    </div>
  )
}
