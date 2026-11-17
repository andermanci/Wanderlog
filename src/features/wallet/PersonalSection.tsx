import { AlertTriangle, Eye, IdCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar, Badge, Button, Card, DocIcon, Empty, Menu, Notice, Row, Section } from '@/design'
import { DOCUMENT_LABELS, formatDate, isFileDoc } from '@/lib/utils'
import type { Document, Traveler } from '@/types/database'
import { DocImage } from './DocImage'
import { expiryState, isIdentity, isImageRef, type FileRef, type IdCardRef } from './shared'

interface Handlers {
  canEdit: boolean
  now: Date
  onViewCard: (card: IdCardRef) => void
  onOpenFile: (file: FileRef) => void
  onEdit: (doc: Document) => void
  onDelete: (doc: Document) => void
}

function ExpiryBadge({ end, now }: { end: string | null; now: Date }) {
  const state = expiryState(end, now)
  if (!state) return null
  return state === 'expired'
    ? <Badge tone="danger" icon={AlertTriangle}>Caducado</Badge>
    : <Badge tone="warning" icon={AlertTriangle}>Caduca pronto</Badge>
}

// Un documento personal. Tocarlo lo abre: los carnés en el visor de dos caras; el
// visado y las vacunas, que son un archivo suelto, en el visor de archivos.
function PersonalDocRow({ doc, travelerName, canEdit, now, onViewCard, onOpenFile, onEdit, onDelete }: Handlers & {
  doc: Document
  travelerName: string | null
}) {
  const label = DOCUMENT_LABELS[doc.category] ?? 'Documento'
  const title = travelerName ? `${label} de ${travelerName}` : label
  const asFile = isFileDoc(doc.category)
  const hasSomething = asFile ? !!doc.file_url : !!(doc.file_url || doc.back_url)

  const view = () => {
    if (asFile) { if (doc.file_url) onOpenFile({ url: doc.file_url, name: title }) }
    else onViewCard({ title, subtitle: doc.confirmation_number, front: doc.file_url, back: doc.back_url })
  }
  const open = hasSomething ? view : canEdit ? () => onEdit(doc) : undefined

  const details = [
    doc.confirmation_number,
    doc.datetime_end ? `Caduca el ${formatDate(doc.datetime_end, 'd MMM yyyy')}` : null,
    !hasSomething ? (asFile ? 'Sin archivo' : 'Sin foto') : null,
  ].filter(Boolean).join(' · ')

  const icon = <DocIcon category={doc.category} className="size-5" />
  return (
    <Row
      leading={
        <span data-tone="primary" className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-tone-soft text-tone">
          {isImageRef(doc.file_url)
            ? <DocImage src={doc.file_url} alt="" className="size-full object-cover" fallback={icon} />
            : icon}
        </span>
      }
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {label}
          <ExpiryBadge end={doc.datetime_end} now={now} />
        </span>
      }
      subtitle={details || (asFile ? 'Toca para ver el archivo' : doc.back_url ? 'Toca para ver las dos caras' : 'Toca para verlo')}
      onClick={open}
      after={canEdit ? (
        <Menu
          label={`Opciones de ${title}`}
          items={[
            hasSomething && { label: asFile ? 'Ver archivo' : 'Ver documento', icon: Eye, onSelect: view },
            { label: 'Editar', icon: Pencil, onSelect: () => onEdit(doc) },
            { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(doc) },
          ]}
        />
      ) : undefined}
    />
  )
}

interface PersonalSectionProps extends Handlers {
  travelers: Traveler[]
  docs: Document[]
  /** Añadir un documento; con viajero si se pulsa dentro de su tarjeta. */
  onAdd: (travelerId?: string) => void
  onAddTraveler: () => void
}

// Documentación personal, agrupada por viajero.
export function PersonalSection({ travelers, docs, onAdd, onAddTraveler, ...handlers }: PersonalSectionProps) {
  const { canEdit, now } = handlers
  const nameById = new Map(travelers.map(t => [t.id, t.name]))
  const unassigned = docs.filter(d => !d.traveler_id || !nameById.has(d.traveler_id))

  // Avisos de caducidad, bien a la vista: muchos países piden 6 meses de validez.
  const expiring = docs
    .map(d => ({ doc: d, state: expiryState(d.datetime_end, now) }))
    .filter(e => e.state !== null)
  const anyExpired = expiring.some(e => e.state === 'expired')

  return (
    <Section
      title="Documentación personal"
      description="DNI, pasaporte, visado, carnet de conducir, tarjeta sanitaria y vacunas de cada viajero."
      action={canEdit && (travelers.length > 0 || docs.length > 0)
        ? <Button onClick={() => onAdd()}><Plus /> Añadir documento</Button>
        : undefined}
    >
      {expiring.length > 0 && (
        <Notice
          tone={anyExpired ? 'danger' : 'warning'}
          icon={AlertTriangle}
          title={anyExpired ? 'Hay documentos caducados' : 'Hay documentos que caducan pronto'}
        >
          <ul className="space-y-0.5">
            {expiring.map(({ doc, state }) => {
              const owner = doc.traveler_id ? nameById.get(doc.traveler_id) : null
              return (
                <li key={doc.id}>
                  {DOCUMENT_LABELS[doc.category]}{owner ? ` de ${owner}` : ''}:{' '}
                  {state === 'expired' ? 'caducó' : 'caduca'} el {formatDate(doc.datetime_end!, "d 'de' MMMM 'de' yyyy")}.
                </li>
              )
            })}
          </ul>
          {!anyExpired && <p className="mt-1">Muchos países piden al menos 6 meses de validez para entrar.</p>}
        </Notice>
      )}

      {travelers.length === 0 && docs.length === 0 ? (
        <Empty
          icon={IdCard}
          title="Lleva los documentos encima"
          description={canEdit
            ? 'Haz una foto del DNI o del pasaporte por las dos caras, o sube el visado y las vacunas. Empieza por decir quién viaja.'
            : 'Aquí aparecerán el DNI, el pasaporte y demás documentos de los viajeros.'}
        >
          {canEdit && (
            <>
              <Button variant="soft" onClick={onAddTraveler}>Añadir viajero</Button>
              <Button variant="ghost" onClick={() => onAdd()}>Añadir documento</Button>
            </>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {travelers.map(t => {
            const own = docs.filter(d => d.traveler_id === t.id)
            const hasId = own.some(isIdentity)
            return (
              <Card key={t.id} pad="none" className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Avatar name={t.name} size="sm" />
                  <h3 className="title-card min-w-0 flex-1 truncate">{t.name}</h3>
                  {!hasId && <Badge tone="warning" icon={AlertTriangle}>Falta DNI o pasaporte</Badge>}
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {own.map(doc => <PersonalDocRow key={doc.id} doc={doc} travelerName={t.name} {...handlers} />)}
                  {own.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Todavía no tiene ningún documento guardado.</p>
                  )}
                  {canEdit && (
                    <div className="px-2.5 py-2">
                      <Button variant="ghost" onClick={() => onAdd(t.id)}><Plus /> Añadir documento de {t.name}</Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}

          {unassigned.length > 0 && (
            <Card pad="none" className="overflow-hidden">
              <div className="px-4 py-3">
                <h3 className="title-card">Sin viajero asignado</h3>
                {canEdit && <p className="text-sm text-muted-foreground">Edita cada documento para decir de quién es.</p>}
              </div>
              <div className="divide-y divide-border border-t border-border">
                {unassigned.map(doc => <PersonalDocRow key={doc.id} doc={doc} travelerName={null} {...handlers} />)}
              </div>
            </Card>
          )}
        </div>
      )}
    </Section>
  )
}
