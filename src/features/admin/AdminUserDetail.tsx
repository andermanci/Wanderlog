import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Map, Shield } from 'lucide-react'
import { Avatar, Badge, Button, Card, Empty, Notice, Page, Section, Skeleton, Stack } from '@/design'
import { useAdminUser, useAdminUserTrips } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate, STATUS_LABELS } from '@/lib/utils'
import { Dato, Datos, TablaSkeleton } from './piezas'
import { tonoEstado } from './colores'
import { LimitsEditor } from './LimitsEditor'
import { DeleteUserDialog } from './DeleteUserDialog'

const ROLES: Record<string, string> = {
  owner: 'Dueño', admin: 'Editar y compartir', editor: 'Editar', viewer: 'Ver',
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const [borrarAbierto, setBorrarAbierto] = useState(false)
  const { data: trips, isLoading } = useAdminUserTrips(userId)
  const { data: u } = useAdminUser(userId)

  return (
    <Page back={{ to: '/admin/usuarios', label: 'Usuarios' }} width="wide">
      <Stack>
        {u ? (
          <div className="flex items-center gap-3.5">
            <Avatar size="lg" name={u.full_name ?? u.email} src={u.avatar_url} />
            <div className="min-w-0">
              <h1 className="title-page flex items-center gap-2">
                <span className="truncate">{u.full_name ?? u.email}</span>
                {u.is_admin && <Badge tone="primary" icon={Shield}>Administra</Badge>}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {u.email} · alta el {formatDate(u.created_at, 'd MMM yyyy')}
              </p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-14 w-72" />
        )}

        {u && (
          <Datos>
            <Dato valor={u.trips} etiqueta="Viajes propios" />
            <Dato valor={u.collaborations} etiqueta="Viajes de otros" />
            <Dato valor={u.activities} etiqueta="Actividades" />
            <Dato valor={formatBytes(u.storage_bytes)} etiqueta="Ocupa" sub="fotos, audios y documentos" />
          </Datos>
        )}

        {u && !u.is_admin && <LimitsEditor u={u} />}

        {/* La zona de peligro va separada de los permisos: no puede estar al
            alcance del dedo mientras se toquetean. */}
        {u && !u.is_admin && (
          <Section title="Zona de peligro">
            <Card data-tone="danger" className="border-tone-line">
              <p className="mb-4 text-sm text-muted-foreground">
                Borrar la cuenta elimina sus viajes, sus documentos y sus ficheros para
                siempre. Si solo quieres pararle los pies, suspéndela: puede deshacerse.
              </p>
              <Button variant="danger-ghost" className="border border-tone-line" onClick={() => setBorrarAbierto(true)}>
                Borrar esta cuenta
              </Button>
              <DeleteUserDialog
                userId={u.user_id}
                abierto={borrarAbierto}
                onClose={() => setBorrarAbierto(false)}
              />
            </Card>
          </Section>
        )}

        {u?.is_admin && (
          <Notice tone="neutral" icon={Shield}>
            Esta persona administra la plataforma, así que no tiene límites y no
            se le pueden poner. Para quitarle el acceso hay que borrar su fila de{' '}
            <code className="font-mono text-xs">app_admins</code> por SQL: no hay botón, y
            es a propósito.
          </Notice>
        )}

        <Section title="Sus viajes" description="Propios y aquellos en los que colabora.">
          {isLoading ? (
            <TablaSkeleton filas={3} />
          ) : !trips?.length ? (
            <Empty icon={Map} title="Sin viajes" description="Esta persona todavía no participa en ningún viaje.">
              <Button asChild variant="outline"><Link to="/admin/viajes">Ver todos los viajes</Link></Button>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {trips.map(t => (
                <li key={t.trip_id}>
                  <Card asChild interactive pad="sm">
                    <Link to={`/admin/viajes/${t.trip_id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                        <div className="min-w-0">
                          <p className="title-card truncate">{t.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {t.destination} · {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yyyy')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge>{ROLES[t.role ?? ''] ?? t.role}</Badge>
                          <Badge tone={tonoEstado(t.status)}>{STATUS_LABELS[t.status] ?? t.status}</Badge>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.days} días · {t.activities} actividades · {t.expenses} gastos ·{' '}
                        {t.documents} documentos · {t.photos} fotos · {t.collaborators} colaboradores
                      </p>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Stack>
    </Page>
  )
}
