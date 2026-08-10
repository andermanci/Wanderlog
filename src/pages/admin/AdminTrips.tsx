import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { useAdminTrips, PAGINA } from '@/lib/queries/admin'
import { AdminHeader, Buscador, TablaSkeleton, Paginacion } from '@/components/admin/AdminShell'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate, STATUS_LABELS } from '@/lib/utils'

export function AdminTripsPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAdminTrips(q, page)

  function buscar(v: string) {
    setQ(v)
    setPage(0)
  }

  return (
    <div>
      <AdminHeader titulo="Viajes" subtitulo="Todos los viajes de la plataforma." />
      <Buscador valor={q} onChange={buscar} placeholder="Buscar por nombre, destino o correo…" />

      {isLoading ? (
        <TablaSkeleton />
      ) : !data?.filas.length ? (
        <EmptyState
          icon={Map}
          title={q ? 'Sin resultados' : 'Sin viajes'}
          description={q ? 'Prueba con otro nombre o destino.' : 'Todavía no hay ningún viaje.'}
        />
      ) : (
        <>
          <div className="hidden md:block rounded-xl surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viaje</TableHead>
                  <TableHead>Dueño</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead className="text-right">Actividades</TableHead>
                  <TableHead className="text-right">Comparten</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.filas.map(t => (
                  <TableRow key={t.trip_id}>
                    <TableCell>
                      <Link to={`/admin/viajes/${t.trip_id}`} className="block min-w-0">
                        <span className="font-medium block truncate">{t.name}</span>
                        <span className="text-xs text-muted-foreground block truncate">{t.destination}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <Link to={`/admin/usuarios/${t.owner_id}`} className="hover:text-foreground">
                        {t.owner_email ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yy')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.activities}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.collaborators}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="md:hidden space-y-2">
            {data.filas.map(t => (
              <li key={t.trip_id}>
                <Link to={`/admin/viajes/${t.trip_id}`} className="block p-4 rounded-xl surface">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{t.destination}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    {t.owner_email ?? '—'} · {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.activities} actividades · {t.collaborators} comparten
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <Paginacion page={page} total={data.total} porPagina={PAGINA}
            onChange={setPage} unidad="viajes" />
        </>
      )}
    </div>
  )
}
