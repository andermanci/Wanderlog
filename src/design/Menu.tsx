import type { ReactNode } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton, type IconButtonProps } from './Button'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Dibuja una línea de separación encima. */
  separated?: boolean
  /** Texto pequeño bajo el rótulo. */
  hint?: string
}

interface MenuProps {
  /** Lo que abre el menú. Si no se pasa, sale el botón «⋯». */
  trigger?: ReactNode
  /** Rótulo del botón «⋯» por defecto. */
  label?: string
  triggerVariant?: IconButtonProps['variant']
  triggerSize?: IconButtonProps['size']
  items: (MenuItem | false | null | undefined)[]
  align?: 'start' | 'end'
}

/** Menú de acciones secundarias de un elemento (Editar, Duplicar, Eliminar…). */
export function Menu({ trigger, label = 'Más opciones', triggerVariant, triggerSize = 'sm', items, align = 'end' }: MenuProps) {
  const visibles = items.filter(Boolean) as MenuItem[]
  if (visibles.length === 0) return null
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        {trigger ?? (
          <IconButton label={label} variant={triggerVariant} size={triggerSize}><MoreHorizontal /></IconButton>
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-[70] min-w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-float data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          {visibles.map((item, i) => (
            <div key={item.label}>
              {item.separated && i > 0 && <Dropdown.Separator className="my-1.5 h-px bg-border" />}
              <Dropdown.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] outline-none',
                  'data-[highlighted]:bg-secondary data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
                  item.danger && 'text-destructive data-[highlighted]:bg-destructive/10',
                )}
              >
                {item.icon && <item.icon className="size-[1.125rem] shrink-0 opacity-80" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                </span>
              </Dropdown.Item>
            </div>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
