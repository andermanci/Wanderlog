import { FilePlus2, MoreHorizontal, Trash2, UserPlus, Users } from 'lucide-react'
import { Avatar, Button, Empty, Menu, Section } from '@/design'
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

const HUECO = 'flex w-24 flex-col items-center rounded-2xl px-1 py-2 text-center'

// Quién viaja. Es la misma lista con la que se reparten los gastos.
// Se pinta como el grupo que es: una fila de caras con su nombre.
export function TravelersSection({ travelers, docs, canEdit, onAdd, onAddDoc, onDelete }: TravelersSectionProps) {
  return (
    <Section
      title="Viajeros"
      description="Las personas que vienen al viaje. Son las mismas entre las que se reparten los gastos."
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
        <ul className="-mx-1 flex flex-wrap gap-x-2 gap-y-3">
          {travelers.map(t => {
            const count = docs.filter(d => d.traveler_id === t.id).length
            const cara = (
              <>
                <span className="relative">
                  <Avatar name={t.name} size="lg" className="size-18 text-2xl font-serif font-medium" />
                  {canEdit && (
                    <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-card">
                      <MoreHorizontal className="size-3.5" />
                    </span>
                  )}
                </span>
                <span className="mt-2 block w-full truncate text-[0.9375rem] font-medium text-foreground">{t.name}</span>
                <span className="block w-full truncate text-xs text-muted-foreground">
                  {count === 0 ? 'Sin documentos' : count === 1 ? '1 documento' : `${count} documentos`}
                </span>
              </>
            )
            return (
              <li key={t.id}>
                {canEdit ? (
                  <Menu
                    align="start"
                    trigger={
                      <button
                        type="button"
                        aria-label={`Opciones de ${t.name}`}
                        className={`${HUECO} cursor-pointer transition-colors duration-150 hover:bg-secondary`}
                      >
                        {cara}
                      </button>
                    }
                    items={[
                      { label: 'Añadir un documento', icon: FilePlus2, onSelect: () => onAddDoc(t.id) },
                      { label: 'Eliminar viajero', icon: Trash2, danger: true, separated: true, onSelect: () => onDelete(t) },
                    ]}
                  />
                ) : (
                  <div className={HUECO}>{cara}</div>
                )}
              </li>
            )
          })}
          {canEdit && (
            <li>
              <button
                type="button"
                onClick={onAdd}
                className={`${HUECO} cursor-pointer text-accent-foreground transition-colors duration-150 hover:bg-primary-soft`}
              >
                <span className="grid size-18 place-items-center rounded-full border border-dashed border-border-strong">
                  <UserPlus className="size-6" aria-hidden="true" />
                </span>
                <span className="mt-2 block text-[0.9375rem] font-medium">Añadir viajero</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </Section>
  )
}
