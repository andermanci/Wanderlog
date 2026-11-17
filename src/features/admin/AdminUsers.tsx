import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Shield } from 'lucide-react'
import { Avatar, Button, Card, Empty, Page } from '@/design'
import { useAdminUsers, PAGINA } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate } from '@/lib/utils'
import type { AdminUserRow } from '@/types/database'
import { Buscador, Paginacion, Tabla, TablaSkeleton, Td, Th, Tr } from './piezas'

export function AdminUsersPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAdminUsers(q, page)

  function buscar(v: string) {
    setQ(v)
    setPage(0)   // sin esto, buscar desde la página 3 deja la lista en blanco
  }

  return (
    <Page title="Usuarios" subtitle="Todas las personas registradas en Wanderlog." width="wide">
      <Buscador valor={q} onChange={buscar} placeholder="Buscar por correo o nombre…" />

      {isLoading ? (
        <TablaSkeleton />
      ) : !data?.filas.length ? (
        <Empty
          icon={Users}
          title={q ? 'Sin resultados' : 'Nadie registrado'}
          description={q ? 'Prueba con otro correo o nombre.' : 'Todavía no se ha registrado nadie.'}
        >
          {q && <Button variant="outline" onClick={() => buscar('')}>Quitar la búsqueda</Button>}
        </Empty>
      ) : (
        <>
          {/* Escritorio: tabla de verdad, con th scope para que un lector de
              pantalla pueda navegarla. Móvil: la misma información en fichas,
              porque seis columnas en 390 px no se leen. */}
          <Tabla className="hidden md:block">
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th num>Viajes</Th>
                <Th num>Colabora</Th>
                <Th num>Actividades</Th>
                <Th num>Ocupa</Th>
                <Th num>Alta</Th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map(u => (
                <Tr key={u.user_id}>
                  <Td>
                    <Link to={`/admin/usuarios/${u.user_id}`} className="block min-w-0">
                      <Persona u={u} />
                    </Link>
                  </Td>
                  <Td num>{u.trips}</Td>
                  <Td num>{u.collaborations}</Td>
                  <Td num>{u.activities}</Td>
                  <Td num>{formatBytes(u.storage_bytes)}</Td>
                  <Td num className="whitespace-nowrap text-muted-foreground">{formatDate(u.created_at, 'd MMM yy')}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>

          <ul className="space-y-2 md:hidden">
            {data.filas.map(u => (
              <li key={u.user_id}>
                <Card asChild interactive pad="sm">
                  <Link to={`/admin/usuarios/${u.user_id}`}>
                    <Persona u={u} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {u.trips} viaje{u.trips === 1 ? '' : 's'} · {u.collaborations} en los que colabora ·{' '}
                      {u.activities} actividades · {formatBytes(u.storage_bytes)} · alta {formatDate(u.created_at, 'd MMM yy')}
                    </p>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

          <Paginacion page={page} total={data.total} porPagina={PAGINA} onChange={setPage} unidad="personas" />
        </>
      )}
    </Page>
  )
}

function Persona({ u }: { u: AdminUserRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar size="sm" name={u.full_name ?? u.email} src={u.avatar_url} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{u.full_name ?? u.email}</span>
          {u.is_admin && (
            <span title="Administra la plataforma" className="inline-flex shrink-0 text-primary">
              <Shield className="size-3.5" aria-label="Administra la plataforma" />
            </span>
          )}
        </p>
        {u.full_name && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
      </div>
    </div>
  )
}
