import { FilePlus2, Trash2, UserPlus, Users } from 'lucide-react'
import { Avatar, Button, Empty, Menu, Row, RowList, Section } from '@/design'
import type { Document, Traveler } from '@/types/database'

interface TravelersSectionProps {
  travelers: Traveler[]
  /** Documentos personales, para contar cuántos tiene cada uno. */
  docs: Document[]
  canEdit: boolean
  onAdd: () => void
  onAddDoc: (travelerId: string) => void
  onDelete: (traveler: Traveler) => void
}

// Quién viaja. Es la misma lista con la que se reparten los gastos.
export function TravelersSection({ travelers, docs, canEdit, onAdd, onAddDoc, onDelete }: TravelersSectionProps) {
  return (
    <Section
      title="Viajeros"
      description="Las personas que vienen al viaje. Son las mismas entre las que se reparten los gastos."
      action={canEdit && travelers.length > 0 ? <Button onClick={onAdd}><UserPlus /> Añadir viajero</Button> : undefined}
    >
      {travelers.length === 0 ? (
        <Empty
          icon={Users}
          title="Aún no hay viajeros"
          description={canEdit
            ? 'Di quién viene al viaje. Así podrás guardar los documentos de cada uno y repartir los gastos entre todos.'
            : 'Aquí aparecerán las personas que vienen al viaje.'}
        >
          {canEdit && <Button variant="soft" onClick={onAdd}>Añadir viajero</Button>}
        </Empty>
      ) : (
        <RowList>
          {travelers.map(t => {
            const count = docs.filter(d => d.traveler_id === t.id).length
            return (
              <Row
                key={t.id}
                leading={<Avatar name={t.name} />}
                title={t.name}
                subtitle={count === 0 ? 'Sin documentos guardados' : count === 1 ? '1 documento guardado' : `${count} documentos guardados`}
                after={canEdit ? (
                  <Menu
                    label={`Opciones de ${t.name}`}
                    items={[
                      { label: 'Añadir un documento', icon: FilePlus2, onSelect: () => onAddDoc(t.id) },
                      { label: 'Eliminar viajero', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(t) },
                    ]}
                  />
                ) : undefined}
              />
            )
          })}
        </RowList>
      )}
    </Section>
  )
}
