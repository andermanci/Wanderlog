import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Map, Shield } from 'lucide-react'
import { useAdminUser, useAdminUserTrips } from '@/lib/queries/admin'
import { AdminHeader, TablaSkeleton, Dato } from '@/components/admin/AdminShell'
import { LimitsEditor } from '@/components/admin/LimitsEditor'
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate, STATUS_LABELS } from '@/lib/utils'

const ROLES: Record<string, string> = {
  owner: 'Dueño', admin: 'Editar y compartir', editor: 'Editar', viewer: 'Ver',
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const [borrarAbierto, setBorrarAbierto] = useState(false)
  const { data: trips, isLoading } = useAdminUserTrips(userId)

  const { data: u } = useAdminUser(userId)

  return (
    <div>
      <Link to="/admin/usuarios"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft size={14} aria-hidden="true" /> Usuarios
      </Link>

      {u ? (
        <div className="flex items-center gap-3 mb-6">
          <Avatar className="w-12 h-12 ring-1 ring-border">
            <AvatarImage src={u.avatar_url ?? undefined} />
            <AvatarFallback style={{ background: 'var(--secondary)', color: 'var(--primary)' }}>
              {(u.full_name?.[0] ?? u.email[0] ?? 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-medium truncate flex items-center gap-2">
              {u.full_name ?? u.email}
              {u.is_admin && <Shield size={16} style={{ color: 'var(--primary)' }} aria-label="Administra la plataforma" />}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              {u.email} · alta el {formatDate(u.created_at, 'd MMM yyyy')}
            </p>
          </div>
        </div>
      ) : (
        <Skeleton className="h-14 w-72 mb-6" style={{ background: 'var(--secondary)' }} />
      )}

      {u && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Dato valor={u.trips} etiqueta="Viajes propios" />
          <Dato valor={u.collaborations} etiqueta="Viajes de otros" />
          <Dato valor={u.activities} etiqueta="Actividades" />
          <Dato valor={formatBytes(u.storage_bytes)} etiqueta="Ocupa" sub="fotos, audios y documentos" />
        </div>
      )}

      {u && !u.is_admin && (
        <div className="mb-8">
          <LimitsEditor u={u} />
        </div>
      )}

      {/* La zona de peligro va al final de todo y separada: no puede estar al
          alcance del dedo mientras se toquetean los permisos. */}
      {u && !u.is_admin && (
        <section className="mb-8 p-5 rounded-xl surface"
          style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
          <h3 className="font-serif text-xl mb-1 text-destructive">Zona de peligro</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Borrar la cuenta elimina sus viajes, sus documentos y sus ficheros para
            siempre. Si solo quieres pararle los pies, suspéndela: puede deshacerse.
          </p>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setBorrarAbierto(true)}
          >
            Borrar esta cuenta
          </Button>
          <DeleteUserDialog
            userId={u.user_id}
            abierto={borrarAbierto}
            onClose={() => setBorrarAbierto(false)}
          />
        </section>
      )}

      {u?.is_admin && (
        <p className="text-sm text-muted-foreground p-4 rounded-xl surface mb-8">
          Esta persona administra la plataforma, así que no tiene límites y no
          se le pueden poner. Para quitarle el acceso hay que borrar su fila de{' '}
          <code className="text-xs">app_admins</code> por SQL: no hay botón, y
          es a propósito.
        </p>
      )}

      <AdminHeader titulo="Sus viajes" subtitulo="Propios y aquellos en los que colabora." />

      {isLoading ? (
        <TablaSkeleton filas={3} />
      ) : !trips?.length ? (
        <EmptyState icon={Map} title="Sin viajes" description="Esta persona todavía no participa en ningún viaje." />
      ) : (
        <ul className="space-y-2">
          {trips.map(t => (
            <li key={t.trip_id}>
              <Link to={`/admin/viajes/${t.trip_id}`}
                className="block p-4 rounded-xl surface transition-colors hover:border-primary">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {t.destination} · {formatDate(t.start_date, 'd MMM')} — {formatDate(t.end_date, 'd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{ROLES[t.role ?? ''] ?? t.role}</Badge>
                    <Badge variant="outline">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t.days} días · {t.activities} actividades · {t.expenses} gastos ·{' '}
                  {t.documents} documentos · {t.photos} fotos · {t.collaborators} colaboradores
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
