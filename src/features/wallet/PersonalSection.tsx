import { AlertTriangle, Eye, IdCard, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar, Badge, Button, DocIcon, Empty, Menu, Notice, Section, type Tone } from '@/design'
import { DOCUMENT_LABELS, cn, formatDate, isFileDoc } from '@/lib/utils'
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

// Cada tipo de documento tiene su color, como los carnés de verdad.
const TONOS: Record<string, Tone> = {
  passport: 'flight',
  dni: 'transport',
  visa: 'place',
  driving_license: 'hotel',
  health_card: 'bar',
  vaccines: 'activity',
}

// Un documento personal con forma de carné: franja del color del tipo, titular
// en grande, número en monoespaciada y la caducidad abajo. Tocarlo lo abre: los
// carnés en el visor de dos caras; el visado y las vacunas, que son un archivo
// suelto, en el visor de archivos.
function Carnet({ doc, travelerName, canEdit, now, onViewCard, onOpenFile, onEdit, onDelete }: Handlers & {
  doc: Document
  travelerName: string | null
}) {
  const label = DOCUMENT_LABELS[doc.category] ?? 'Documento'
  const title = travelerName ? `${label} de ${travelerName}` : label
  const asFile = isFileDoc(doc.category)
  const hasSomething = asFile ? !!doc.file_url : !!(doc.file_url || doc.back_url)
  const state = expiryState(doc.datetime_end, now)

  const view = () => {
    if (asFile) { if (doc.file_url) onOpenFile({ url: doc.file_url, name: title }) }
    else onViewCard({ title, subtitle: doc.confirmation_number, front: doc.file_url, back: doc.back_url })
  }
  const open = hasSomething ? view : canEdit ? () => onEdit(doc) : undefined

  const icon = <DocIcon category={doc.category} className="size-6" />
  const content = (
    <>
      <span className="eyebrow flex items-center gap-1.5 pr-10 text-tone">
        <DocIcon category={doc.category} className="size-3.5" /> {label}
      </span>

      <span className="mt-auto block pt-4">
        <span className={cn(
          'block truncate font-serif text-xl font-medium leading-tight tracking-tight',
          !travelerName && 'text-muted-foreground',
        )}>
          {travelerName ?? 'Sin viajero asignado'}
        </span>
        {doc.confirmation_number && (
          <span className="mt-1 block truncate font-mono text-sm font-semibold tracking-wider">{doc.confirmation_number}</span>
        )}
      </span>

      <span className="mt-auto flex items-end justify-between gap-3 pt-4">
        <span className="min-w-0">
          {doc.datetime_end ? (
            <span
              data-tone={state === 'expired' ? 'danger' : state === 'soon' ? 'warning' : 'neutral'}
              className="block"
            >
              <span className="eyebrow flex items-center gap-1 text-tone">
                {state && <AlertTriangle className="size-3.5" aria-hidden="true" />}
                {state === 'expired' ? 'Caducó el' : 'Caduca el'}
              </span>
              <span className={cn('block text-sm font-semibold tabular-nums', state ? 'text-tone' : 'text-foreground')}>
                {formatDate(doc.datetime_end, 'd MMM yyyy')}
                {state === 'soon' && <span className="font-medium"> · pronto</span>}
              </span>
            </span>
          ) : (
            <span className="block text-sm text-muted-foreground">Sin fecha de caducidad</span>
          )}
        </span>

        {/* Miniatura de la foto, o el hueco donde iría */}
        {isImageRef(doc.file_url) ? (
          <span className="grid aspect-[8/5] w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-tone-soft text-tone">
            <DocImage src={doc.file_url} alt="" className="size-full object-cover" fallback={icon} />
          </span>
        ) : hasSomething ? (
          <span className="grid aspect-[8/5] w-20 shrink-0 place-items-center rounded-lg bg-tone-soft text-tone">{icon}</span>
        ) : (
          <span className="flex aspect-[8/5] w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border-strong text-2xs font-medium text-muted-foreground">
            <ImageOff className="size-4" aria-hidden="true" />
            {asFile ? 'Sin archivo' : 'Sin foto'}
          </span>
        )}
      </span>
    </>
  )

  const body = 'flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3 text-left'
  return (
    <article
      data-tone={TONOS[doc.category] ?? 'primary'}
      // El borde se dibuja ENCIMA (after:) en vez de en la propia tarjeta: así la franja
      // de color llega hasta el canto y no asoma una línea por encima de ella.
      className="relative flex aspect-[8/5] min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-card after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:border after:border-tone-line"
    >
      <span aria-hidden="true" className="h-2 shrink-0 bg-tone" />
      {open ? (
        <button
          type="button"
          onClick={open}
          title={hasSomething ? (asFile ? 'Ver el archivo' : doc.back_url ? 'Ver las dos caras' : 'Ver el documento') : 'Editar para añadir la foto'}
          className={cn(body, 'cursor-pointer transition-colors duration-150 hover:bg-secondary/60')}
        >
          {content}
        </button>
      ) : (
        <div className={body}>{content}</div>
      )}
      {canEdit && (
        <div className="absolute right-1.5 top-3 z-10">
          <Menu
            label={`Opciones de ${title}`}
            items={[
              hasSomething && { label: asFile ? 'Ver archivo' : 'Ver documento', icon: Eye, onSelect: view },
              { label: 'Editar', icon: Pencil, onSelect: () => onEdit(doc) },
              { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(doc) },
            ]}
          />
        </div>
      )}
    </article>
  )
}

/** El hueco de un carné que aún no está: añade un documento. */
function HuecoCarnet({ label, onClick, compact }: { label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3 text-[0.9375rem] font-medium text-accent-foreground transition-colors duration-150 hover:bg-primary-soft',
        // Junto a un carné ocupa su mismo hueco; solo, es una línea: un recuadro enorme vacío no dice nada.
        compact ? 'sm:col-span-2' : 'sm:aspect-[8/5] sm:flex-col',
      )}
    >
      <Plus className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 text-center">{label}</span>
    </button>
  )
}

const REJILLA = 'grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2'

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
        <div className="space-y-8 pt-1">
          {travelers.map(t => {
            const own = docs.filter(d => d.traveler_id === t.id)
            const hasId = own.some(isIdentity)
            return (
              <div key={t.id} className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3">
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1 basis-44">
                    <h3 className="truncate font-serif text-lg font-medium tracking-tight">{t.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {own.length === 0
                        ? 'Todavía no tiene ningún documento guardado.'
                        : own.length === 1 ? '1 documento' : `${own.length} documentos`}
                    </p>
                  </div>
                  {!hasId && <Badge tone="warning" icon={AlertTriangle}>Falta DNI o pasaporte</Badge>}
                </div>
                {(own.length > 0 || canEdit) && (
                  <div className={REJILLA}>
                    {own.map(doc => <Carnet key={doc.id} doc={doc} travelerName={t.name} {...handlers} />)}
                    {canEdit && <HuecoCarnet label={`Añadir documento de ${t.name}`} onClick={() => onAdd(t.id)} compact={own.length === 0} />}
                  </div>
                )}
              </div>
            )
          })}

          {unassigned.length > 0 && (
            <div className="space-y-3">
              <div className="border-b border-border pb-3">
                <h3 className="font-serif text-lg font-medium tracking-tight">Sin viajero asignado</h3>
                {canEdit && <p className="text-sm text-muted-foreground">Edita cada documento para decir de quién es.</p>}
              </div>
              <div className={REJILLA}>
                {unassigned.map(doc => <Carnet key={doc.id} doc={doc} travelerName={null} {...handlers} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
