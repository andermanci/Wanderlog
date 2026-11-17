import { NavLink, useLocation } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/lib/queries/admin'
import { GLOBAL_NAV, tripTabs, type NavItem } from './nav'

/** Barra inferior (solo móvil). Dentro de un viaje, sus cinco pestañas; fuera, las globales. */
export function TabBar({ tripId }: { tripId?: string }) {
  const { pathname } = useLocation()
  const { data: soyAdmin } = useIsAdmin()

  const items: NavItem[] = tripId
    ? tripTabs(tripId)
    : [
        ...GLOBAL_NAV,
        ...(soyAdmin ? [{ key: 'admin', label: 'Admin', icon: Shield, to: '/admin', match: () => false }] : []),
      ]

  return (
    <nav
      aria-label={tripId ? 'Secciones del viaje' : 'Principal'}
      className="bar-glass fixed inset-x-0 bottom-0 z-30 flex border-t border-border pb-safe md:hidden"
    >
      {items.map(item => {
        const active = item.match(pathname)
        return (
          <NavLink
            key={item.key}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors duration-150',
              active ? 'text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <span className={cn(
              'grid h-8 w-14 place-items-center rounded-full transition-colors duration-200',
              active && 'bg-primary-soft',
            )}>
              <item.icon className="size-[1.375rem]" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
            </span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
