import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScrollText } from 'lucide-react'
import { Button, Card, Empty, Page } from '@/design'
import { useAdminAudit, AUDIT_PAGE } from '@/lib/queries/admin'
import { formatDate } from '@/lib/utils'
import { Paginacion, TablaSkeleton } from './piezas'

// Etiquetas de las acciones. Un mapa explícito y no un formateo automático del
// identificador: el registro se lee cuando algo ha ido mal, y ahí «user.delete.done»
// obliga a traducir mentalmente mientras se busca.
const ACCIONES: Record<string, string> = {
  'user.delete.start': 'Empezó a borrar una cuenta',
  'user.delete.done': 'Borró una cuenta',
  'user.suspend': 'Suspendió una cuenta',
  'user.unsuspend': 'Reactivó una cuenta',
  'user.limits': 'Cambió los permisos',
  'trip.transfer': 'Transfirió un viaje',
}

export function AdminAuditPage() {
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAdminAudit(page)

  const total = data?.total ?? 0

  return (
    <Page title="Auditoría" subtitle="Todo lo que se hace desde este panel queda escrito aquí." width="wide">
      {isLoading ? (
        <TablaSkeleton filas={5} />
      ) : !data?.filas.length ? (
        <Empty
          icon={ScrollText}
          title="Sin movimientos"
          description="Todavía no se ha hecho nada desde el panel. Lo que cambies en la ficha de un usuario aparecerá aquí."
        >
          <Button asChild variant="outline"><Link to="/admin/usuarios">Ir a Usuarios</Link></Button>
        </Empty>
      ) : (
        <ul className="space-y-2">
          {data.filas.map(e => (
            <li key={e.id}>
              <Card pad="sm">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ACCIONES[e.action] ?? e.action}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {e.admin_email ?? 'admin desconocido'}
                      {e.target_email && <> · sobre {e.target_email}</>}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.at}>
                    {formatDate(e.at, "d MMM yyyy 'a las' HH:mm")}
                  </time>
                </div>
                {Object.keys(e.detail ?? {}).length > 0 && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(e.detail)}
                  </pre>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Paginacion page={page} total={total} porPagina={AUDIT_PAGE} onChange={setPage}
        unidad={total === 1 ? 'entrada' : 'entradas'} />
    </Page>
  )
}
