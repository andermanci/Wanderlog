import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Shield } from 'lucide-react'
import { useAdminUsers, PAGINA } from '@/lib/queries/admin'
import { AdminHeader, Buscador, TablaSkeleton, Paginacion } from '@/components/admin/AdminShell'
import { EmptyState } from '@/components/EmptyState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate } from '@/lib/utils'
import type { AdminUserRow } from '@/types/database'

export function AdminUsersPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useAdminUsers(q, page)

  function buscar(v: string) {
    setQ(v)
    setPage(0)   // sin esto, buscar desde la página 3 deja la lista en blanco
  }

  return (
    <div>
      <AdminHeader
        titulo="Usuarios"
        subtitulo="Todas las personas registradas en Wanderlog."
      />
      <Buscador valor={q} onChange={buscar} placeholder="Buscar por correo o nombre…" />

      {isLoading ? (
        <TablaSkeleton />
      ) : !data?.filas.length ? (
        <EmptyState
          icon={Users}
          title={q ? 'Sin resultados' : 'Nadie registrado'}
          description={q ? 'Prueba con otro correo o nombre.' : 'Todavía no se ha registrado nadie.'}
        />
      ) : (
        <>
          {/* Escritorio: tabla de verdad, con th scope para que un lector de
              pantalla pueda navegarla. Móvil: la misma información en fichas,
              porque doce columnas en 390 px no se leen. */}
          <div className="hidden md:block rounded-xl surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Colabora</TableHead>
                  <TableHead className="text-right">Actividades</TableHead>
                  <TableHead className="text-right">Ocupa</TableHead>
                  <TableHead className="text-right">Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.filas.map(u => (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <Link to={`/admin/usuarios/${u.user_id}`} className="block min-w-0">
                        <Persona u={u} />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.trips}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.collaborations}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.activities}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBytes(u.storage_bytes)}</TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {formatDate(u.created_at, 'd MMM yy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="md:hidden space-y-2">
            {data.filas.map(u => (
              <li key={u.user_id}>
                <Link to={`/admin/usuarios/${u.user_id}`} className="block p-4 rounded-xl surface">
                  <Persona u={u} />
                  <p className="text-xs text-muted-foreground mt-2">
                    {u.trips} viaje{u.trips === 1 ? '' : 's'} · {u.activities} actividades ·{' '}
                    {formatBytes(u.storage_bytes)} · alta {formatDate(u.created_at, 'd MMM yy')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <Paginacion page={page} total={data.total} porPagina={PAGINA}
            onChange={setPage} unidad="personas" />
        </>
      )}
    </div>
  )
}

function Persona({ u }: { u: AdminUserRow }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="w-8 h-8 shrink-0 ring-1 ring-border">
        <AvatarImage src={u.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs" style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
          {(u.full_name?.[0] ?? u.email[0] ?? 'U').toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {u.full_name ?? u.email}
          {u.is_admin && (
            <span title="Administra la plataforma" className="shrink-0 inline-flex">
              <Shield size={13} style={{ color: 'var(--primary)' }} aria-label="Administra la plataforma" />
            </span>
          )}
        </p>
        {u.full_name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
      </div>
    </div>
  )
}
