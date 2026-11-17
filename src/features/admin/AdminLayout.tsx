import { Link, NavLink, Outlet } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'
import { Button } from '@/design'
import { cn } from '@/lib/utils'

// Layout propio, no el armazón de la app. El armazón arrastra la navegación de
// viajes, el «+», el buscador y la cartera; el panel no necesita nada de eso y
// no debe cargarlo. Sigue dentro de ProtectedRoute, porque hace falta sesión.

const SECCIONES = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/viajes', label: 'Viajes' },
  { to: '/admin/visitas', label: 'Visitas' },
  { to: '/admin/eventos', label: 'Eventos' },
  { to: '/admin/auditoria', label: 'Auditoría' },
]

export function AdminLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header data-shell className="bar-glass sticky top-0 z-30 border-b border-border pt-safe">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-foreground">
                <Shield className="size-4.5" aria-hidden="true" />
              </span>
              <p className="title-section truncate">Administración</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link to="/dashboard">
                <ArrowLeft aria-hidden="true" />
                Volver a la app
              </Link>
            </Button>
          </div>

          {/* Scroll horizontal en móvil: seis secciones no caben, y partirlas
              en dos filas descoloca la cabecera al cambiar de pestaña. */}
          <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Secciones de administración">
            {SECCIONES.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn(
                  'inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                  isActive
                    ? 'border-primary font-semibold text-accent-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-safe">
        <Outlet />
      </main>
    </div>
  )
}
