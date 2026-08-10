import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronLeft, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

// Layout propio, no AppLayout. AppLayout arrastra el Sidebar de viajes, la
// BottomNav, el buscador Cmd+K y el modal de la cartera; el panel no necesita
// nada de eso y no debe cargarlo. Sigue dentro de ProtectedRoute, porque hace
// falta sesión.

const SECCIONES = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/viajes', label: 'Viajes' },
  { to: '/admin/visitas', label: 'Visitas' },
  { to: '/admin/eventos', label: 'Eventos' },
  { to: '/admin/auditoria', label: 'Auditoría' },
]

export function AdminLayout() {
  const location = useLocation()

  return (
    <div
      className="min-h-dvh bg-background flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="border-b border-border" style={{ background: 'var(--sidebar)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)',
                }}>
                <Shield size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
              </div>
              <h1 className="font-serif text-lg font-medium truncate">Administración</h1>
            </div>
            <NavLink
              to="/dashboard"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Volver a</span> Wanderlog
            </NavLink>
          </div>

          {/* Scroll horizontal en móvil: seis secciones no caben, y partirlas
              en dos filas descoloca la cabecera al cambiar de pestaña. */}
          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-px" aria-label="Secciones de administración">
            {SECCIONES.map(({ to, label, end }) => {
              const activa = end ? location.pathname === to : location.pathname.startsWith(to)
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={cn(
                    'px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors',
                    activa
                      ? 'border-current text-primary font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
