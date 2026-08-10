import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useAdminAudit, AUDIT_PAGE } from '@/lib/queries/admin'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

// Etiquetas de las acciones. Un mapa explícito y no un formateo automático del
// identificador: el registro se lee cuando algo ha ido mal, y ahí "user.delete.done"
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
  const paginas = Math.ceil(total / AUDIT_PAGE)

  return (
    <div>
      <h2 className="font-serif text-2xl font-medium">Auditoría</h2>
      <p className="text-muted-foreground text-sm mt-0.5">
        Todo lo que se hace desde este panel queda escrito aquí.
      </p>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" style={{ background: 'var(--secondary)' }} />
            ))}
          </div>
        ) : !data?.filas.length ? (
          <EmptyState
            icon={ScrollText}
            title="Sin movimientos"
            description="Todavía no se ha hecho nada desde el panel de administración."
          />
        ) : (
          <ul className="space-y-2">
            {data.filas.map(e => (
              <li key={e.id} className="p-4 rounded-xl surface">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ACCIONES[e.action] ?? e.action}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {e.admin_email ?? 'admin desconocido'}
                      {e.target_email && <> · sobre {e.target_email}</>}
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground shrink-0" dateTime={e.at}>
                    {formatDate(e.at, "d MMM yyyy 'a las' HH:mm")}
                  </time>
                </div>
                {Object.keys(e.detail ?? {}).length > 0 && (
                  <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto">
                    {JSON.stringify(e.detail)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}

        {paginas > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              {total} entrada{total === 1 ? '' : 's'} · página {page + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0}
                onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= paginas}
                onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
