import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Confirm, Field, Input, Page, Section, Select, Stack } from '@/design'
import { useDeleteTrip, useDuplicateTrip, useTrip, useUpdateTrip } from '@/lib/queries/trips'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { STATUS_LABELS } from '@/lib/utils'
import { CurrencySelect } from '@/features/money/Currency'
import type { Trip } from '@/types/database'
import { Collaborators } from './Collaborators'
import { OfflineCard } from './OfflineCard'
import { deleteTripCopy } from './copy'

/** Ajustes de UN viaje: dinero, estado, con quién se comparte, copia sin conexión y borrado. */
export function TripSettingsPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId)
  const { data: role } = useTripRole(tripId)
  const isOwner = role === 'owner'
  const canEdit = canEditRole(role)
  const updateTrip = useUpdateTrip()
  const deleteTrip = useDeleteTrip()
  const duplicateTrip = useDuplicateTrip()
  const navigate = useNavigate()

  const [currency, setCurrency] = useState('EUR')
  const [budget, setBudget] = useState('')
  const [status, setStatus] = useState<Trip['status']>('planning')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // El formulario se rellena con el viaje cuando llega (o cuando cambia al guardar).
  const [seededFrom, setSeededFrom] = useState<Trip | null>(null)
  if (trip && trip !== seededFrom) {
    setSeededFrom(trip)
    setCurrency(trip.default_currency || 'EUR')
    setBudget(trip.budget_total != null ? String(trip.budget_total) : '')
    setStatus(trip.status)
  }

  const dirty = !!trip && (
    currency !== (trip.default_currency || 'EUR')
    || budget !== (trip.budget_total != null ? String(trip.budget_total) : '')
    || status !== trip.status
  )

  async function save() {
    const parsed = budget.trim() === '' ? null : Number(budget.replace(',', '.'))
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Ese presupuesto no es un importe válido.')
      return
    }
    await updateTrip.mutateAsync({ id: tripId, default_currency: currency, budget_total: parsed, status }).catch(() => {})
  }

  return (
    <Page
      width="narrow"
      title="Ajustes del viaje"
      subtitle="Solo afectan a este viaje."
      back={{ to: `/trips/${tripId}`, label: 'Inicio del viaje' }}
    >
      <Stack gap="lg">
        {canEdit && (
          <Section title="Dinero y estado">
            <Card className="space-y-5">
              <Field label="Moneda del viaje" hint="La que se propone al apuntar un gasto. Los totales se pasan a tu moneda con el cambio del día.">
                <CurrencySelect value={currency} onChange={setCurrency} />
              </Field>
              <Field label="Presupuesto total" optional hint="Marca el tope de la barra en Gastos. Vacío = sin límite.">
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Sin límite" value={budget} onChange={e => setBudget(e.target.value)} />
              </Field>
              <Field label="Estado" hint="«En curso» y «Completado» se ponen solos según las fechas.">
                <Select value={status} onChange={e => setStatus(e.target.value as Trip['status'])}>
                  {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </Select>
              </Field>
              <Button variant="primary" disabled={!dirty} loading={updateTrip.isPending} onClick={save}>Guardar cambios</Button>
            </Card>
          </Section>
        )}

        <Section title="Con quién lo compartes" description="Quien entra invitado solo puede ver. Si el viaje es tuyo, puedes dejarle editar.">
          <Card><Collaborators tripId={tripId} /></Card>
        </Section>

        <Section title="Sin conexión">
          <OfflineCard tripId={tripId} />
        </Section>

        {/* Duplicar y eliminar son cosas de quien creó el viaje: la RLS solo se lo deja a él. */}
        {isOwner && (
          <Section title="Duplicar">
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Crea un viaje nuevo con el mismo plan, días y guía del destino. Los gastos, documentos y avisos no se copian.
              </p>
              <Button
                variant="outline" loading={duplicateTrip.isPending}
                onClick={async () => {
                  const copy = await duplicateTrip.mutateAsync(tripId).catch(() => null)
                  if (copy) navigate(`/trips/${copy.id}`)
                }}
              >
                <Copy /> Duplicar viaje
              </Button>
            </Card>
          </Section>
        )}

        {isOwner && (
          <Section title="Eliminar">
            <Card data-tone="danger" className="flex flex-col gap-4 border-tone-line bg-tone-soft sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">
                Borra el viaje con todo lo que tiene: plan, gastos, documentos… No se puede deshacer.
              </p>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 /> Eliminar viaje</Button>
            </Card>
          </Section>
        )}
      </Stack>

      <Confirm
        open={confirmDelete} onOpenChange={setConfirmDelete} danger loading={deleteTrip.isPending}
        {...deleteTripCopy(trip?.name ?? '')}
        onConfirm={async () => {
          await deleteTrip.mutateAsync(tripId).catch(() => null)
          navigate('/dashboard')
        }}
      />
    </Page>
  )
}
