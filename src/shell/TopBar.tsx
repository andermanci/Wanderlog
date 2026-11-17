import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, Search, Settings, Share2, Shield } from 'lucide-react'
import { Avatar, Button, IconButton, Menu } from '@/design'
import { cn } from '@/lib/utils'
import { useTrip } from '@/lib/queries/trips'
import { useIsAdmin } from '@/lib/queries/admin'
import { canShareRole, useTripRole } from '@/lib/queries/sharing'
import { useSignOut } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { useTripSearchStore } from '@/store/tripSearchStore'
import { fallbackCover } from '@/lib/coverFallbacks'
import { GLOBAL_NAV, tripExtras, tripTabs, type NavItem } from './nav'
import { useUiStore } from './uiStore'
import { QuickAdd } from './QuickAdd'

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <NavLink
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium transition-colors duration-150',
        active ? 'bg-primary-soft text-accent-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <item.icon className="size-[1.125rem]" aria-hidden="true" />
      {item.label}
    </NavLink>
  )
}

function SearchButton() {
  const open = useTripSearchStore(s => s.setOpen)
  return (
    <>
      {/* Escritorio: parece un campo, con el atajo a la vista */}
      <button
        type="button"
        onClick={() => open(true)}
        className="hidden lg:inline-flex h-10 w-52 items-center gap-2 rounded-full border border-border bg-sunken px-3.5 text-sm text-muted-foreground transition-colors hover:border-border-strong"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded bg-card px-1.5 py-0.5 text-2xs font-medium border border-border">⌘K</kbd>
      </button>
      <IconButton label="Buscar" className="lg:hidden" onClick={() => open(true)}><Search /></IconButton>
    </>
  )
}

function AccountMenu() {
  const { user, profile } = useAuthStore()
  const { data: soyAdmin } = useIsAdmin()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const name = profile?.full_name || user?.email || ''
  return (
    <Menu
      label="Tu cuenta"
      trigger={
        <button type="button" aria-label="Tu cuenta" className="rounded-full transition-transform active:scale-95">
          <Avatar name={name} src={profile?.avatar_url} />
        </button>
      }
      items={[
        { label: 'Ajustes', icon: Settings, onSelect: () => navigate('/settings'), hint: user?.email ?? undefined },
        soyAdmin && { label: 'Administración', icon: Shield, onSelect: () => navigate('/admin') },
        { label: 'Cerrar sesión', icon: LogOut, onSelect: () => { void signOut() }, separated: true },
      ]}
    />
  )
}

/** Barra superior. Fuera de un viaje: marca + secciones. Dentro: el viaje + sus cinco pestañas. */
export function TopBar({ tripId }: { tripId?: string }) {
  return (
    <header data-shell className="bar-glass sticky top-0 z-30 shrink-0 border-b border-border">
      {tripId ? <TripBar tripId={tripId} /> : <GlobalBar />}
    </header>
  )
}

function GlobalBar() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-8">
      <Link to="/dashboard" className="font-serif text-xl font-medium tracking-tight md:text-2xl">
        Wander<span className="text-primary">log</span>
      </Link>
      <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 md:flex">
        {GLOBAL_NAV.filter(i => i.key !== 'ajustes').map(i => <Tab key={i.key} item={i} active={i.match(pathname)} />)}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        <AccountMenu />
      </div>
    </div>
  )
}

function TripBar({ tripId }: { tripId: string }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: trip } = useTrip(tripId)
  const { data: role } = useTripRole(tripId)
  const openShare = useUiStore(s => s.openShare)
  const tabs = tripTabs(tripId)
  const extras = tripExtras(tripId)

  return (
    <div className="flex h-14 items-center gap-2 px-2 md:h-16 md:gap-3 md:px-5">
      <IconButton asChild label="Todos los viajes">
        <Link to="/dashboard"><ArrowLeft /></Link>
      </IconButton>

      <Link to={`/trips/${tripId}`} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-3 transition-colors hover:bg-secondary md:max-w-64">
        <img
          src={trip?.cover_image_url || fallbackCover(tripId)}
          alt=""
          className="size-9 shrink-0 rounded-full border border-border object-cover"
        />
        <span className="truncate font-serif text-lg font-medium leading-tight">{trip?.name ?? ' '}</span>
      </Link>

      {/* Las cinco pestañas: en móvil van en la barra inferior */}
      <nav aria-label="Secciones del viaje" className="mx-auto hidden items-center gap-1 md:flex">
        {tabs.map(t => <Tab key={t.key} item={t} active={t.match(pathname)} />)}
      </nav>

      <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
        <SearchButton />
        {canShareRole(role) && (
          <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => openShare(tripId)}>
            <Share2 /> Compartir
          </Button>
        )}
        <div className="hidden md:block"><QuickAdd tripId={tripId} /></div>
        <Menu
          label="Más del viaje"
          triggerSize="md"
          items={[
            canShareRole(role) && { label: 'Compartir viaje', icon: Share2, onSelect: () => openShare(tripId) },
            ...extras.map((e, i) => ({
              label: e.label, icon: e.icon, onSelect: () => navigate(e.to),
              separated: i === 0 || e.key === 'ajustes',
            })),
          ]}
        />
      </div>
    </div>
  )
}
