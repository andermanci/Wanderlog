import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Badge, Card, Checkbox, Menu } from '@/design'
import { cn } from '@/lib/utils'
import type { PackingItem } from '@/types/database'

interface PackingCategoryProps {
  name: string
  items: PackingItem[]
  canEdit: boolean
  onToggle: (item: PackingItem, checked: boolean) => void
  onDelete: (item: PackingItem) => void
}

/** Una categoría del equipaje: cabecera que se pliega y sus elementos con casilla grande. */
export function PackingCategory({ name, items, canEdit, onToggle, onDelete }: PackingCategoryProps) {
  const [collapsed, setCollapsed] = useState(false)
  const done = items.filter(i => i.is_checked).length
  const complete = done === items.length

  return (
    <Card pad="none" className="overflow-hidden">
      <h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-secondary/70"
        >
          <span className="min-w-0 flex-1 truncate title-card">{name}</span>
          <Badge tone={complete ? 'success' : 'neutral'} className="tabular-nums">
            {complete ? 'Listo' : `${done} de ${items.length}`}
          </Badge>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', collapsed && '-rotate-90')}
          />
        </button>
      </h2>

      {!collapsed && (
        <ul className="divide-y divide-border border-t border-border">
          {items.map(item => {
            const id = `equipaje-${item.id}`
            return (
              <li key={item.id} className="flex items-center gap-1 pl-4 pr-2.5">
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
                    'flex min-h-14 min-w-0 flex-1 items-center py-2 pl-3 text-[0.9375rem]',
                    canEdit && 'cursor-pointer',
                    item.is_checked && 'text-muted-foreground line-through',
                  )}
                >
                  {item.name}
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
    </Card>
  )
}
