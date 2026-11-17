import { Navigate, Outlet } from 'react-router-dom'
import { Spinner } from '@/design'
import { useAuthStore } from '@/store/authStore'
import { useIsAdmin } from '@/lib/queries/admin'

function Arranque() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="size-8" />
        <span className="font-serif text-xl text-muted-foreground">Wander<span className="text-primary">log</span></span>
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading } = useAuthStore()
  if (loading) return <Arranque />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

// Guard del panel de administración.
//
// ES COSMÉTICO, y conviene tenerlo claro: la seguridad de verdad vive en
// `admin_guard()` dentro de cada RPC de Postgres. Esto solo evita enseñar una
// carcasa vacía a quien no puede llenarla.
//
// A propósito NO es lazy: lo que envuelve sí lo es, y React Router no monta un
// elemento lazy hasta que este componente devuelve <Outlet/>, así que quien no
// administra no descarga ni un byte del panel.
export function AdminRoute() {
  const { data: soyAdmin, isPending } = useIsAdmin()
  // Mientras no se sepa, no se pinta nada del panel.
  if (isPending) return <Arranque />
  if (!soyAdmin) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
