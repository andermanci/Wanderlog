import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, Settings, Map, Receipt, FileText, Home,
  MoreHorizontal, Bookmark, BookOpen, Package, Bell, Heart, type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  tripId?: string
}

// Secciones del viaje accesibles desde la hoja "Más" (las que no caben en la
// barra). Así ninguna sección obliga a pasar por el Resumen en móvil.
const MORE_SECTIONS: { path: string; icon: LucideIcon; label: string }[] = [
  { path: 'documents', icon: FileText, label: 'Documentos' },
  { path: 'places', icon: Bookmark, label: 'Lugares' },
  { path: 'guide', icon: BookOpen, label: 'Guía' },
  { path: 'packing', icon: Package, label: 'Equipaje' },
  { path: 'reminders', icon: Bell, label: 'Avisos' },
  { path: 'memory', icon: Heart, label: 'Recuerdo' },
  { path: 'settings', icon: Settings, label: 'Ajustes' },
]

// Navegación inferior para móvil. Dentro de un viaje: secciones clave del
// "modo viaje" + "Más" con el resto; fuera, la navegación global.
export function BottomNav({ tripId }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const items = tripId
    ? [
        { to: `/trips/${tripId}`, icon: Home, label: 'Resumen', exact: true },
        { to: `/trips/${tripId}/itinerary`, icon: Calendar, label: 'Itinerario' },
        { to: `/trips/${tripId}/map`, icon: Map, label: 'Mapa' },
        { to: `/trips/${tripId}/expenses`, icon: Receipt, label: 'Gastos' },
      ]
    : [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Viajes', exact: true },
        { to: '/calendar', icon: Calendar, label: 'Calendario' },
        { to: '/settings', icon: Settings, label: 'Ajustes' },
      ]

  // "Más" queda activo cuando la ruta actual es una de sus secciones.
  const moreActive = !!tripId && MORE_SECTIONS.some(s => {
    const to = `/trips/${tripId}/${s.path}`
    return location.pathname === to || location.pathname.startsWith(to + '/')
  })

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border flex"
      style={{
        background: 'var(--sidebar)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map(({ to, icon: Icon, label, exact }) => {
        // Las sub-rutas (p. ej. detalle de actividad) mantienen activa su sección.
        const active = exact
          ? location.pathname === to
          : location.pathname === to || location.pathname.startsWith(to + '/')
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

      {tripId && (
        <>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Más secciones del viaje"
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors',
              moreActive ? 'text-primary font-semibold' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal size={20} strokeWidth={moreActive ? 2.4 : 1.8} />
            Más
          </button>

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl"
              style={{ background: 'var(--card)', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            >
              <SheetHeader>
                <SheetTitle className="font-serif text-left text-base">Este viaje</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {MORE_SECTIONS.map(({ path, icon: Icon, label }) => {
                  const to = `/trips/${tripId}/${path}`
                  const active = location.pathname === to || location.pathname.startsWith(to + '/')
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => { setMoreOpen(false); navigate(to) }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] transition-colors',
                        active ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground',
                      )}
                      style={{
                        background: active
                          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                          : 'var(--secondary)',
                      }}
                    >
                      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </nav>
  )
}
