import { Link, useParams } from 'react-router-dom'
import { MapPinOff } from 'lucide-react'
import { Badge, Button, Empty, Page, Row, RowList, Section, Skeleton, Stack } from '@/design'
import { useAdminTripOverview, useAdminTripItinerary } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'
import { formatDate, STATUS_LABELS } from '@/lib/utils'
import { Dato, Datos } from './piezas'
import { tonoEstado } from './colores'
import { ItinerarioRedactado } from './ItinerarioRedactado'

const ROLES: Record<string, string> = {
  admin: 'Editar y compartir', editor: 'Editar', viewer: 'Ver',
}

const VOLVER = { to: '/admin/viajes', label: 'Viajes' }

export function AdminTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: v, isLoading, isError } = useAdminTripOverview(tripId)
  const { data: itinerario, isLoading: cargandoItinerario } = useAdminTripItinerary(tripId)

  if (isLoading) {
    return (
      <Page back={VOLVER} width="wide">
        <Skeleton className="h-40 w-full" />
      </Page>
    )
  }

  // `admin_trip_overview` devuelve null si el viaje no existe (lo han borrado
  // mientras mirabas la lista, por ejemplo).
  if (isError || !v) {
    return (
      <Page back={VOLVER} width="wide">
        <Empty icon={MapPinOff} title="Este viaje ya no existe" description="Puede que lo hayan borrado mientras mirabas la lista.">
          <Button asChild variant="outline"><Link to="/admin/viajes">Volver a los viajes</Link></Button>
        </Empty>
      </Page>
    )
  }

  return (
    <Page
      back={VOLVER}
      title={v.name}
      subtitle={`${v.destination} · ${formatDate(v.start_date, 'd MMM')} — ${formatDate(v.end_date, 'd MMM yyyy')}`}
      actions={<Badge tone={tonoEstado(v.status)}>{STATUS_LABELS[v.status] ?? v.status}</Badge>}
      width="wide"
    >
      <Stack>
        <p className="-mt-3 text-sm text-muted-foreground">
          De{' '}
          <Link to={`/admin/usuarios/${v.owner_id}`} className="text-accent-foreground underline underline-offset-4">
            {v.owner_email ?? 'usuario desconocido'}
          </Link>
          {' '}· creado el {formatDate(v.created_at, 'd MMM yyyy')}
        </p>

        <div className="space-y-3">
          <Datos>
            <Dato valor={v.days} etiqueta="Días" />
            <Dato valor={v.activities} etiqueta="Actividades" sub={`${v.activities_done} hechas`} />
            <Dato valor={v.expenses} etiqueta="Gastos"
              sub={v.expense_currencies.length ? `en ${v.expense_currencies.join(', ')}` : undefined} />
            <Dato valor={formatBytes(v.storage_bytes)} etiqueta="Ocupa" sub="fotos, audios y documentos" />
          </Datos>
          <Datos>
            <Dato valor={v.documents} etiqueta="Documentos" />
            <Dato valor={v.photos} etiqueta="Fotos del diario" />
            <Dato valor={v.journal_days} etiqueta="Días con diario" />
            <Dato valor={v.audioguides} etiqueta="Audioguías" sub={`${v.audio_stops_ready} paradas con audio`} />
          </Datos>
        </div>

        {v.collaborators.length > 0 && (
          <Section title="Quién más lo ve">
            <RowList>
              {v.collaborators.map(c => (
                <Row
                  key={c.email}
                  title={c.email}
                  trailing={
                    <>
                      <Badge>{ROLES[c.role] ?? c.role}</Badge>
                      {!c.accepted && <Badge tone="warning">Sin aceptar</Badge>}
                    </>
                  }
                />
              ))}
            </RowList>
          </Section>
        )}

        <Section title="Itinerario">
          <ItinerarioRedactado filas={itinerario} cargando={cargandoItinerario} />
        </Section>
      </Stack>
    </Page>
  )
}
