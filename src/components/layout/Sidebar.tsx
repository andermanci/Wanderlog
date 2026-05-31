import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Map, FileText, Calendar,
  Bell, Package, Receipt, Settings, LogOut,
  Compass, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { signOut } from '@/hooks/useAuth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useState } from 'react'
import { toast } from 'sonner'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
}

interface TripNavItem {
  to: string
  icon: React.ReactNode
  label: string
}

interface SidebarProps {
  tripId?: string
}

const globalNav: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard', end: true },
  { to: '/calendar', icon: <Calendar size={18} />, label: 'Calendario' },
  { to: '/settings', icon: <Settings size={18} />, label: 'Ajustes' },
]

function getTripNav(tripId: string): TripNavItem[] {
  return [
    { to: `/trips/${tripId}`, icon: <LayoutDashboard size={18} />, label: 'Resumen' },
    { to: `/trips/${tripId}/itinerary`, icon: <Calendar size={18} />, label: 'Itinerario' },
    { to: `/trips/${tripId}/map`, icon: <Map size={18} />, label: 'Mapa' },
    { to: `/trips/${tripId}/documents`, icon: <FileText size={18} />, label: 'Documentos' },
    { to: `/trips/${tripId}/reminders`, icon: <Bell size={18} />, label: 'Avisos' },
    { to: `/trips/${tripId}/packing`, icon: <Package size={18} />, label: 'Equipaje' },
    { to: `/trips/${tripId}/expenses`, icon: <Receipt size={18} />, label: 'Gastos' },
  ]
}

export function Sidebar({ tripId }: SidebarProps) {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login')
    } catch {
      toast.error('Error al cerrar sesión')
    }
  }

  const navItems = tripId ? getTripNav(tripId) : globalNav

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex flex-col h-full border-r border-border relative"
      style={{ background: 'var(--sidebar-background, #0d0d16)', minWidth: collapsed ? 64 : 220 }}
    >
      {/* Toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        style={{ background: '#12121a' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-border', collapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #c9a84c22, #c9a84c55)', border: '1px solid #c9a84c44' }}>
          <Compass size={16} style={{ color: '#c9a84c' }} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="font-serif text-lg font-medium text-gold-gradient whitespace-nowrap overflow-hidden"
            >
              Wanderlog
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav trip (volver) */}
      {tripId && !collapsed && (
        <div className="px-3 pt-3">
          <NavLink to="/dashboard"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-secondary">
            <ChevronLeft size={14} />
            <span>Todos los viajes</span>
          </NavLink>
          <p className="text-xs text-muted-foreground mt-2 mb-1 px-2 uppercase tracking-widest">Este viaje</p>
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <Tooltip key={item.to} delayDuration={0}>
            <TooltipTrigger asChild>
              <NavLink
                to={item.to}
                end={'end' in item ? (item as NavItem).end : true}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                  isActive && 'bg-primary/10',
                )}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </nav>

      {/* Usuario */}
      <div className={cn(
        'mt-auto border-t border-border p-3 flex items-center gap-3',
        collapsed && 'justify-center flex-col py-4',
      )}>
        <Avatar className="w-8 h-8 flex-shrink-0 ring-1 ring-border">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs" style={{ background: '#1a1a26', color: '#c9a84c' }}>
            {profile?.full_name?.[0] ?? profile?.email?.[0] ?? 'U'}
          </AvatarFallback>
        </Avatar>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <p className="text-xs font-medium truncate text-foreground">{profile?.full_name ?? 'Usuario'}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 w-7 h-7 text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Cerrar sesión</p></TooltipContent>
        </Tooltip>
      </div>
    </motion.aside>
  )
}
