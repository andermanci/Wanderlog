import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Checkbox, Menu } from '@/design'
import { cn } from '@/lib/utils'
import type { PackingItem } from '@/types/database'

interface PackingCategoryProps {
  name: string
  items: PackingItem[]
  canEdit: boolean
  onToggle: (item: PackingItem, checked: boolean) => void
  onDelete: (item: PackingItem) => void
}

/**
 * Una categoría del equipaje, como un apartado de una lista de comprobación:
 * rótulo con su contador sobre una regla, y debajo las cosas con casilla grande.
 * Lo que ya está en la maleta baja al final, tachado y atenuado.
 */
export function PackingCategory({ name, items, canEdit, onToggle, onDelete }: PackingCategoryProps) {
  const [collapsed, setCollapsed] = useState(false)
  const done = items.filter(i => i.is_checked).length
  const complete = done === items.length
  // Lo pendiente primero; dentro de cada grupo se respeta el orden de la lista.
  const ordered = [...items.filter(i => !i.is_checked), ...items.filter(i => i.is_checked)]

  return (
    <section data-tone={complete ? 'success' : 'neutral'} className="break-inside-avoid">
      <h2 className="border-b-2 border-foreground/80">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
          className="flex min-h-12 w-full items-end gap-3 pb-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-serif text-xl font-medium leading-tight tracking-tight">{name}</span>
          <span className="eyebrow shrink-0 pb-0.5 text-tone tabular-nums">
            {complete ? 'Listo' : `${done} de ${items.length}`}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('mb-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200', collapsed && '-rotate-90')}
          />
        </button>
      </h2>

      {!collapsed && (
        <ul>
          {ordered.map(item => {
            const id = `equipaje-${item.id}`
            return (
              <li key={item.id} className="flex items-center border-b border-border">
                <Checkbox
                  round
                  id={id}
                  className="size-7"
                  checked={item.is_checked}
                  disabled={!canEdit}
                  onCheckedChange={checked => onToggle(item, checked)}
                />
                <label
                  htmlFor={id}
                  className={cn(
                    'flex min-h-14 min-w-0 flex-1 items-center py-2 pl-3.5 text-base transition-opacity duration-150',
                    canEdit && 'cursor-pointer',
                    item.is_checked && 'text-muted-foreground line-through opacity-60',
                  )}
                >
                  <span className="min-w-0 break-words">{item.name}</span>
                </label>
                {canEdit && (
                  <Menu
                    label={`Opciones de ${item.name}`}
                    items={[{ label: 'Quitar de la lista', icon: Trash2, danger: true, onSelect: () => onDelete(item) }]}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
