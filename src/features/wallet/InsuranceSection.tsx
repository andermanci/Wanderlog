import { Phone, Plus, ShieldCheck } from 'lucide-react'
import { Button, Empty, Row, RowList, Section } from '@/design'
import type { Document } from '@/types/database'

interface InsuranceSectionProps {
  docs: Document[]
  canEdit: boolean
  onOpen: (doc: Document) => void
  onAdd: () => void
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
        <RowList>
          {docs.map(doc => (
            <Row
              key={doc.id}
              icon={ShieldCheck}
              tone="info"
              title={doc.title}
              subtitle={[doc.provider, doc.confirmation_number ? `Póliza ${doc.confirmation_number}` : null].filter(Boolean).join(' · ') || 'Toca para ver los datos'}
              chevron
              onClick={() => onOpen(doc)}
              after={doc.phone ? (
                <Button asChild variant="soft" size="sm" className="h-11 md:h-9">
                  <a href={`tel:${doc.phone}`} aria-label={`Llamar a asistencia: ${doc.phone}`}><Phone /> Llamar</a>
                </Button>
              ) : undefined}
            />
          ))}
        </RowList>
      )}
    </Section>
  )
}
