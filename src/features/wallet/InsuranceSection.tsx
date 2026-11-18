import { ChevronRight, Phone, Plus, ShieldCheck } from 'lucide-react'
import { Button, Empty, Section } from '@/design'
import type { Document } from '@/types/database'

interface InsuranceSectionProps {
  docs: Document[]
  canEdit: boolean
  onOpen: (doc: Document) => void
  onAdd: () => void
}

// Un seguro con forma de póliza: quién asegura, el número bien legible y, lo
// que de verdad importa cuando pasa algo, el teléfono de asistencia a un toque.
function Poliza({ doc, onOpen }: { doc: Document; onOpen: (doc: Document) => void }) {
  return (
    <article data-tone="info" className="flex min-w-0 overflow-hidden rounded-2xl border border-tone-line bg-card shadow-card">
      <span aria-hidden="true" className="w-1.5 shrink-0 bg-tone" />
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => onOpen(doc)}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 px-4 pb-3 pt-3.5 text-left transition-colors duration-150 hover:bg-secondary/60"
        >
          <span className="min-w-0 flex-1">
            <span className="eyebrow flex items-center gap-1.5 text-tone">
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Póliza de seguro
            </span>
            <span className="mt-1 block font-serif text-lg font-medium leading-snug tracking-tight line-clamp-2">{doc.title}</span>
            {doc.provider && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{doc.provider}</span>}
            <span className="mt-3 block">
              <span className="eyebrow block">Nº de póliza</span>
              {doc.confirmation_number
                ? <span className="block break-all font-mono text-base font-semibold tracking-wider">{doc.confirmation_number}</span>
                : <span className="block text-sm text-muted-foreground">Sin número guardado</span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-medium text-muted-foreground">
            Ver <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </button>
        <div className="border-t border-dashed border-border-strong p-3">
          {doc.phone ? (
            <Button asChild variant="soft" size="lg" block>
              <a href={`tel:${doc.phone}`} aria-label={`Llamar a asistencia: ${doc.phone}`}>
                <Phone />
                <span className="min-w-0 truncate">Llamar · <span className="tabular-nums">{doc.phone}</span></span>
              </a>
            </Button>
          ) : (
            <p className="px-1 py-1.5 text-sm text-muted-foreground">Sin teléfono de asistencia guardado.</p>
          )}
        </div>
      </div>
    </article>
  )
}

// Pólizas de seguro, con el teléfono de asistencia a un toque.
export function InsuranceSection({ docs, canEdit, onOpen, onAdd }: InsuranceSectionProps) {
  return (
    <Section
      title="Seguros"
      description="La póliza y el teléfono de asistencia, por si acaso."
      action={canEdit && docs.length > 0 ? <Button onClick={onAdd}><Plus /> Añadir seguro</Button> : undefined}
    >
      {docs.length === 0 ? (
        <Empty
          icon={ShieldCheck}
          title="Sin seguro guardado"
          description={canEdit
            ? 'Guarda la póliza de viaje y el teléfono de asistencia. Si pasa algo, lo tendrás aquí sin buscar en el correo.'
            : 'Aquí aparecerá el seguro del viaje cuando alguien lo añada.'}
        >
          {canEdit && <Button variant="soft" onClick={onAdd}>Añadir seguro</Button>}
        </Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          {docs.map(doc => <Poliza key={doc.id} doc={doc} onOpen={onOpen} />)}
        </div>
      )}
    </Section>
  )
}
