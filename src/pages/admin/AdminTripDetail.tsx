import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAdminTripOverview, useAdminTripItinerary } from '@/lib/queries/admin'
import { AdminHeader, Dato } from '@/components/admin/AdminShell'
import { ItinerarioRedactado } from '@/components/admin/ItinerarioRedactado'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate, STATUS_LABELS } from '@/lib/utils'

const ROLES: Record<string, string> = {
  admin: 'Editar y compartir', editor: 'Editar', viewer: 'Ver',
}

export function AdminTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: v, isLoading, isError } = useAdminTripOverview(tripId)
  const { data: itinerario, isLoading: cargandoItinerario } = useAdminTripItinerary(tripId)

  if (isLoading) {
    return <Skeleton className="h-40 w-full" style={{ background: 'var(--secondary)' }} />
  }

  // `admin_trip_overview` devuelve null si el viaje no existe (lo han borrado
  // mientras mirabas la lista, por ejemplo).
  if (isError || !v) {
    return (
      <div>
        <Volver />
        <p className="text-sm text-muted-foreground">Este viaje ya no existe.</p>
      </div>
    )
  }

  return (
    <div>
      <Volver />

      <AdminHeader
        titulo={v.name}
        subtitulo={`${v.destination} · ${formatDate(v.start_date, 'd MMM')} — ${formatDate(v.end_date, 'd MMM yyyy')}`}
      >
        <Badge variant="outline">{STATUS_LABELS[v.status] ?? v.status}</Badge>
      </AdminHeader>

      <p className="text-sm text-muted-foreground -mt-3 mb-6">
        De{' '}
        <Link to={`/admin/usuarios/${v.owner_id}`} className="underline underline-offset-2 hover:text-foreground">
          {v.owner_email ?? 'usuario desconocido'}
        </Link>
        {' '}· creado el {formatDate(v.created_at, 'd MMM yyyy')}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Dato valor={v.days} etiqueta="Días" />
        <Dato valor={v.activities} etiqueta="Actividades" sub={`${v.activities_done} hechas`} />
        <Dato valor={v.expenses} etiqueta="Gastos"
          sub={v.expense_currencies.length ? `en ${v.expense_currencies.join(', ')}` : undefined} />
        <Dato valor={formatBytes(v.storage_bytes)} etiqueta="Ocupa" sub="fotos, audios y documentos" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Dato valor={v.documents} etiqueta="Documentos" />
        <Dato valor={v.photos} etiqueta="Fotos del diario" />
        <Dato valor={v.journal_days} etiqueta="Días con diario" />
        <Dato valor={v.audioguides} etiqueta="Audioguías" sub={`${v.audio_stops_ready} paradas con audio`} />
      </div>

      {v.collaborators.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Quién más lo ve
          </h3>
          <ul className="space-y-2">
            {v.collaborators.map(c => (
              <li key={c.email} className="flex items-center justify-between gap-3 p-3 rounded-xl surface">
                <span className="text-sm truncate">{c.email}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{ROLES[c.role] ?? c.role}</Badge>
                  {!c.accepted && <Badge variant="outline">Sin aceptar</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
        Itinerario
      </h3>
      <ItinerarioRedactado filas={itinerario} cargando={cargandoItinerario} />
    </div>
  )
}

function Volver() {
  return (
    <Link to="/admin/viajes"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
      <ChevronLeft size={14} aria-hidden="true" /> Viajes
    </Link>
  )
}
