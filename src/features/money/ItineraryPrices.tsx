import { useState } from 'react'
import { ChevronDown, Plus, Tag } from 'lucide-react'
import { ActivityIcon, Button } from '@/design'
import { cn, formatCurrency } from '@/lib/utils'
import type { Activity } from '@/types/database'

interface ItineraryPricesProps {
  /** Actividades con precio que todavía no son un gasto. */
  activities: Activity[]
  currency: string
  saving: boolean
  onAdd: (activity: Activity) => void
  onAddAll: () => void
}

/**
 * «Precios del plan»: una franja discreta que avisa de las actividades con precio
 * que aún no se han apuntado como gasto. Se despliega para convertirlas una a una.
 */
export function ItineraryPrices({ activities, currency, saving, onAdd, onAddAll }: ItineraryPricesProps) {
  const [open, setOpen] = useState(false)
  const one = activities.length === 1

  return (
    <section aria-label="Precios del plan" className="rounded-2xl bg-sunken">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 pl-4 pr-2">
        <Tag className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-48 text-sm">
          {one
            ? <>Hay <strong className="font-semibold">1 actividad</strong> del plan con precio que aún no es un gasto.</>
            : <>Hay <strong className="font-semibold">{activities.length} actividades</strong> del plan con precio que aún no son gastos.</>}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            {open ? 'Ocultar' : 'Ver cuáles'}
            <ChevronDown className={cn('transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
          </Button>
          {!one && <Button variant="outline" size="sm" disabled={saving} onClick={onAddAll}>Añadir todas</Button>}
        </div>
      </div>

      {open && (
        <ul className="border-t border-border px-4">
          {activities.map(a => (
            <li key={a.id} data-tone={a.type} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 last:border-b-0">
              <ActivityIcon type={a.type} className="size-4.5 shrink-0 text-tone" />
              <span className="min-w-0 flex-1 basis-40 truncate text-[0.9375rem]">{a.title}</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(a.price ?? 0, currency)}</span>
              <Button variant="soft" size="sm" disabled={saving} onClick={() => onAdd(a)} aria-label={`Convertir ${a.title} en gasto`}>
                <Plus aria-hidden="true" /> Convertir en gasto
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
