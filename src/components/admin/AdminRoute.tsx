import { Navigate, Outlet } from 'react-router-dom'
import { useIsAdmin } from '@/lib/queries/admin'

// Guard del panel de administración.
//
// ES COSMÉTICO, y conviene tenerlo claro: la seguridad de verdad vive en
// `admin_guard()` dentro de cada RPC de Postgres. Esto solo evita enseñar una
// carcasa vacía a quien no puede llenarla. Quien fuerce /admin desde las
// devtools verá 42501 en todas partes.
//
// A propósito NO es lazy: son cuatro líneas y va en el bundle principal. Lo
// que envuelve sí lo es, y React Router no monta un elemento lazy hasta que
// este componente devuelve <Outlet/>, así que quien no administra no descarga
// ni un byte del panel.
export function AdminRoute() {
  const { data: soyAdmin, isPending } = useIsAdmin()

  // Mientras no se sepa, no se renderiza nada del panel. Sin esta rama, un
  // no-admin vería la pantalla entera durante un frame antes de la redirección.
  if (isPending) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!soyAdmin) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
