import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActivityIcon, Button, Row, RowList, Section } from '@/design'
import { formatCurrency } from '@/lib/utils'
import type { Activity } from '@/types/database'

interface ItineraryPricesProps {
  /** Actividades con precio que todavía no son un gasto. */
  activities: Activity[]
  currency: string
  saving: boolean
  onAdd: (activity: Activity) => void
  onAddAll: () => void
}

const PREVIEW = 3

/** «Precios del itinerario»: actividades con precio que aún no se han apuntado como gasto. */
export function ItineraryPrices({ activities, currency, saving, onAdd, onAddAll }: ItineraryPricesProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? activities : activities.slice(0, PREVIEW)
  const hidden = activities.length - visible.length

  return (
    <Section
      title="Precios del plan"
      description={activities.length === 1
        ? 'Hay 1 actividad del plan con precio que aún no es un gasto.'
        : `Hay ${activities.length} actividades del plan con precio que aún no son gastos.`}
      action={activities.length > 1 && (
        <Button variant="outline" size="sm" disabled={saving} onClick={onAddAll}>Añadir todas</Button>
      )}
    >
      <RowList>
        {visible.map(a => (
          <Row
            key={a.id}
            leading={(
              <span data-tone={a.type} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                <ActivityIcon type={a.type} className="size-5" />
              </span>
            )}
            title={a.title}
            subtitle={<span className="tabular-nums">{formatCurrency(a.price ?? 0, currency)}</span>}
            after={(
              <Button variant="soft" size="sm" disabled={saving} onClick={() => onAdd(a)} aria-label={`Convertir ${a.title} en gasto`}>
                <Plus aria-hidden="true" /> Convertir en gasto
              </Button>
            )}
          />
        ))}
      </RowList>
      {(hidden > 0 || showAll) && activities.length > PREVIEW && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Ver menos' : `Ver ${hidden} más`}
        </Button>
      )}
    </Section>
  )
}
