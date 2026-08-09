import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, Coins, Flag, Trash2, Loader2, Copy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CurrencySelect } from '@/components/CurrencySelect'
import { TripHeader } from '@/components/trips/TripHeader'
import { CollaboratorsManager } from '@/components/trips/CollaboratorsManager'
import { OfflineDataSection } from '@/components/trips/OfflineDataSection'
import { useTrip, useUpdateTrip, useDeleteTrip, useDuplicateTrip } from '@/lib/queries/trips'
import { useTripRole } from '@/lib/queries/sharing'
import { STATUS_LABELS } from '@/lib/utils'
import type { Trip } from '@/types/database'
import { toast } from 'sonner'

const STATUS_OPTIONS: Trip['status'][] = ['planning', 'confirmed', 'in_progress', 'completed']

export function TripSettingsPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip } = useTrip(tripId!)
  const { data: role } = useTripRole(tripId!)
  const isOwner = role === 'owner'
  const updateTrip = useUpdateTrip()
  const deleteTrip = useDeleteTrip()
  const duplicateTrip = useDuplicateTrip()
  const navigate = useNavigate()

  const [currency, setCurrency] = useState('EUR')
  const [budget, setBudget] = useState('')
  const [status, setStatus] = useState<Trip['status']>('planning')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sembrar el formulario cuando carga el viaje.
  useEffect(() => {
    if (!trip) return
    setCurrency(trip.default_currency || 'EUR')
    setBudget(trip.budget_total != null ? String(trip.budget_total) : '')
    setStatus(trip.status)
  }, [trip])

  const dirty = !!trip && (
    currency !== (trip.default_currency || 'EUR') ||
    budget !== (trip.budget_total != null ? String(trip.budget_total) : '') ||
    status !== trip.status
  )

  async function save() {
    if (!tripId) return
    const parsed = budget.trim() === '' ? null : Number(budget.replace(',', '.'))
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('El presupuesto no es válido')
      return
    }
    await updateTrip.mutateAsync({
      id: tripId,
      default_currency: currency,
      budget_total: parsed,
      status,
    })
  }

  async function onDelete() {
    if (!tripId) return
    await deleteTrip.mutateAsync(tripId)
    navigate('/dashboard')
  }

  async function onDuplicate() {
    if (!tripId) return
    const copy = await duplicateTrip.mutateAsync(tripId)
    navigate(`/trips/${copy.id}`)
  }


  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Ajustes" />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif text-2xl font-medium mb-1">Ajustes del viaje</h1>
        <p className="text-muted-foreground text-sm mb-8">Preferencias específicas de este viaje</p>

        {/* Divisa */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Coins size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Divisa</h2>
          </div>
          <div className="p-6 rounded-xl space-y-1.5 surface">
            <Label>Divisa por defecto</Label>
            <CurrencySelect value={currency} onChange={setCurrency} className="w-56" />
            <p className="text-xs text-muted-foreground">
              Se usará al anotar los gastos de este viaje. Los totales se convierten a tu divisa
              principal con el cambio del día.
            </p>
          </div>
        </section>

        {/* Presupuesto */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Presupuesto</h2>
          </div>
          <div className="p-6 rounded-xl space-y-1.5 surface">
            <Label>Presupuesto total</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Sin límite"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-56"
            />
            <p className="text-xs text-muted-foreground">Marca el tope de la barra de progreso en Gastos. Déjalo vacío para no fijar límite.</p>
          </div>
        </section>

        {/* Estado */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Flag size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Estado</h2>
          </div>
          <div className="p-6 rounded-xl space-y-1.5 surface">
            <Label>Estado del viaje</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Trip['status'])}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <Button
          onClick={save}
          disabled={!dirty || updateTrip.isPending}
          variant="brand"
        >
          {updateTrip.isPending && <Loader2 size={14} className="animate-spin mr-2" />}
          Guardar cambios
        </Button>

        {/* Colaboradores y permisos */}
        <section className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Colaboradores</h2>
          </div>
          <div className="p-6 rounded-xl surface">
            <p className="text-xs text-muted-foreground mb-4">
              Los invitados entran con permiso de solo lectura. Como propietario puedes
              subirles el nivel a «Editar» o «Editar y compartir».
            </p>
            <CollaboratorsManager tripId={tripId!} />
          </div>
        </section>

        {/* Duplicar viaje. Cosa del creador: quien viaja invitado no saca
            copias del viaje de otro. */}
        {isOwner && (
        <section className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <Copy size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Duplicar viaje</h2>
          </div>
          <div className="p-6 rounded-xl flex items-center justify-between gap-3 surface">
            <div className="min-w-0">
              <p className="font-medium text-sm">Crear una copia</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Copia el itinerario, días y guía del destino a un viaje nuevo. Gastos,
                documentos y avisos no se duplican.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-1.5 flex-shrink-0"
              disabled={duplicateTrip.isPending}
              onClick={onDuplicate}
            >
              {duplicateTrip.isPending ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
              Duplicar
            </Button>
          </div>
        </section>
        )}

        <OfflineDataSection tripId={tripId!} />

        {/* Zona de peligro. Solo para quien creó el viaje: la RLS ya solo le
            deja borrarlo a él (trips_delete_own), así que a un colaborador el
            botón le fallaba en silencio. */}
        {isOwner && (
        <section className="mt-12">
          <h2 className="font-serif text-xl mb-4 text-destructive">Zona de peligro</h2>
          <div className="p-6 rounded-xl flex items-center justify-between gap-3"
            style={{ background: 'color-mix(in srgb, var(--destructive) 6%, var(--card))', border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
            <div className="min-w-0">
              <p className="font-medium text-sm">Eliminar viaje</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Borra el viaje y todo su contenido (itinerario, gastos, documentos…). No se puede deshacer.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-1.5 flex-shrink-0 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Eliminar
            </Button>
          </div>
        </section>
        )}
      </motion.div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{trip?.name}» y todo su contenido. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              style={{ background: 'var(--destructive)', color: 'white' }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
