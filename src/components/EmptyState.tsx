import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Estado vacío consistente y claro: icono + título + explicación + acción.
// Unifica los "no hay nada todavía" de toda la app con un tono que orienta.
export function EmptyState({ icon: Icon, title, description, children }: {
  icon: LucideIcon
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'color-mix(in srgb, var(--primary) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)' }}>
        <Icon size={28} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      </div>
      <h3 className="font-serif text-xl text-foreground mb-1">{title}</h3>
      {description && <p className="text-muted-foreground text-sm max-w-sm">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}
