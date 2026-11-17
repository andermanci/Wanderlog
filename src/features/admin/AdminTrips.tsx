import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { Badge, Button, Card, Empty, Page } from '@/design'
import { useAdminTrips, PAGINA } from '@/lib/queries/admin'
import { formatDate, STATUS_LABELS } from '@/lib/utils'
import { Buscador, Paginacion, Tabla, TablaSkeleton, Td, Th, Tr } from './piezas'
import { tonoEstado } from './colores'

export function AdminTripsPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAdminTrips(q, page)

  function buscar(v: string) {
    setQ(v)
    setPage(0)
  }

  return (
    <Page title="Viajes" subtitle="Todos los viajes de la plataforma." width="wide">
      <Buscador valor={q} onChange={buscar} placeholder="Buscar por nombre, destino o correo…" />

      {isLoading ? (
        <TablaSkeleton />
      ) : !data?.filas.length ? (
        <Empty
          icon={Map}
          title={q ? 'Sin resultados' : 'Sin viajes'}
          description={q ? 'Prueba con otro nombre o destino.' : 'Todavía no hay ningún viaje.'}
        >
          {q && <Button variant="outline" onClick={() => buscar('')}>Quitar la búsqueda</Button>}
        </Empty>
      ) : (
        <>
          <Tabla className="hidden md:block">
            <thead>
              <tr>
                <Th>Viaje</Th>
                <Th>Dueño</Th>
                <Th>Fechas</Th>
                <Th num>Actividades</Th>
                <Th num>Comparten</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map(t => (
                <Tr key={t.trip_id}>
                  <Td>
                    <Link to={`/admin/viajes/${t.trip_id}`} className="block min-w-0">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.destination}</span>
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <Link to={`/admin/usuarios/${t.owner_id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                      {t.owner_email ?? '—'}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yy')}
                  </Td>
                  <Td num>{t.activities}</Td>
                  <Td num>{t.collaborators}</Td>
                  <Td><Badge tone={tonoEstado(t.status)}>{STATUS_LABELS[t.status] ?? t.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>

          <ul className="space-y-2 md:hidden">
            {data.filas.map(t => (
              <li key={t.trip_id}>
                <Card asChild interactive pad="sm">
                  <Link to={`/admin/viajes/${t.trip_id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="title-card truncate">{t.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{t.destination}</p>
                      </div>
                      <Badge tone={tonoEstado(t.status)} className="shrink-0">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {t.owner_email ?? '—'} · {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.activities} actividades · {t.collaborators} comparten
                    </p>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

          <Paginacion page={page} total={data.total} porPagina={PAGINA} onChange={setPage} unidad="viajes" />
        </>
      )}
    </Page>
  )
}
