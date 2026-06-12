import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, Settings, Map, Receipt, FileText, Home,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  tripId?: string
}

// Navegación inferior para móvil. Dentro de un viaje muestra las secciones
// clave del "modo viaje" (Itinerario, Mapa, Documentos, Gastos); fuera, la
// navegación global. Avisos y Equipaje quedan accesibles desde el Resumen.
export function BottomNav({ tripId }: BottomNavProps) {
  const location = useLocation()

  const items = tripId
    ? [
        { to: `/trips/${tripId}`, icon: Home, label: 'Resumen' },
        { to: `/trips/${tripId}/itinerary`, icon: Calendar, label: 'Itinerario' },
        { to: `/trips/${tripId}/map`, icon: Map, label: 'Mapa' },
        { to: `/trips/${tripId}/documents`, icon: FileText, label: 'Docs' },
        { to: `/trips/${tripId}/expenses`, icon: Receipt, label: 'Gastos' },
      ]
    : [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Viajes' },
        { to: '/calendar', icon: Calendar, label: 'Calendario' },
        { to: '/settings', icon: Settings, label: 'Ajustes' },
      ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border flex"
      style={{
        background: 'var(--sidebar)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map(({ to, icon: Icon, label }) => {
        const active = location.pathname === to
        return (
          <NavLink
            key={to}
            to={to}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors',
              active ? 'text-primary font-semibold' : 'text-muted-foreground',
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </NavLink>
        )
      })}
    </nav>
  )
}
