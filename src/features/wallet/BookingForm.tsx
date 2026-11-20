import { useId, useState } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { ChevronDown } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Card, Field, Input, Select, SwitchRow, Textarea } from '@/design'
import { useCreateDocument, useUpdateDocument, type NewDocument } from '@/lib/queries/documents'
import { useSyncReservation } from '@/lib/queries/reservationSync'
import { canShowInItinerary } from '@/lib/reservationLink'
import { cn } from '@/lib/utils'
import type { Document } from '@/types/database'
import { FileField } from './FileField'
import { PanelFooter } from './PanelSlots'
import { BOOKING_CATEGORIES } from './shared'

const schema = z.object({
  title: z.string().trim().min(1, 'Ponle un título para encontrarlo luego'),
  category: z.enum(['flight', 'train', 'bus', 'hotel', 'car_rental', 'transfer', 'tour', 'ticket', 'insurance', 'other']),
  confirmation_number: z.string().optional(),
  locator: z.string().optional(),
  provider: z.string().optional(),
  link: z.string().url('Tiene que ser una dirección web completa (https://…)').optional().or(z.literal('')),
  start_date: z.string().optional(),
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  end_time: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  seat: z.string().optional(),
  flight_number: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  show_in_itinerary: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>
export type BookingCategory = FormValues['category']

// Fecha y hora se guardan juntas («2026-03-04T10:30»), como hasta ahora.
const join = (date?: string, time?: string) => (date ? `${date}T${time || '00:00'}` : null)

function defaults(doc: Document | undefined, category: BookingCategory): FormValues {
  if (!doc) return { title: '', category, show_in_itinerary: true }
  return {
    title: doc.title,
    category: doc.category as BookingCategory,
    confirmation_number: doc.confirmation_number ?? '',
    locator: doc.locator ?? '',
    provider: doc.provider ?? '',
    link: doc.link ?? '',
    start_date: doc.datetime_start?.slice(0, 10) ?? '',
    start_time: doc.datetime_start?.slice(11, 16) ?? '',
    end_date: doc.datetime_end?.slice(0, 10) ?? '',
    end_time: doc.datetime_end?.slice(11, 16) ?? '',
    origin: doc.origin ?? '',
    destination: doc.destination ?? '',
    seat: doc.seat ?? '',
    flight_number: doc.flight_number ?? '',
    phone: doc.phone ?? '',
    notes: doc.notes ?? '',
    // Al editar, el estado real es si ya tiene su parada en el plan.
    show_in_itinerary: !!doc.activity_id,
  }
}

interface BookingFormProps {
  tripId: string
  /** Si se pasa, se edita; si no, se crea. */
  doc?: Document
  /** Categoría de partida al crear. */
  category?: BookingCategory
  onSaved: (doc: Document) => void
  onCancel: () => void
}

// Formulario de billetes, reservas y seguros. Los campos cambian con el tipo.
export function BookingForm({ tripId, doc, category = 'other', onSaved, onCancel }: BookingFormProps) {
  const formId = useId()
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()
  const syncReservation = useSyncReservation(tripId)
  const [fileUrl, setFileUrl] = useState<string | null>(doc?.file_url ?? null)
  // Segundo adjunto opcional (póliza + condiciones, ida + vuelta…): va en back_url.
  const [fileUrl2, setFileUrl2] = useState<string | null>(doc?.back_url ?? null)
  const [busy, setBusy] = useState(0)
  // Lo que casi nunca se rellena va plegado, para que apuntar una reserva sea corto.
  // Al editar, se abre solo si ya hay algo escrito dentro.
  const [more, setMore] = useState(() => !!doc && !!(
    doc.link || doc.back_url || doc.notes
    || (doc.category === 'other' && (doc.locator || doc.seat || doc.origin || doc.destination || doc.phone))
  ))

  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: defaults(doc, category),
  })
  const cat = useWatch({ control, name: 'category' })
  const startDate = useWatch({ control, name: 'start_date' })
  const showInItinerary = useWatch({ control, name: 'show_in_itinerary' })

  const isTransport = ['flight', 'train', 'bus', 'transfer'].includes(cat)
  const isStay = cat === 'hotel' || cat === 'car_rental'
  const isEvent = cat === 'tour' || cat === 'ticket'
  const isInsurance = cat === 'insurance'
  const isOther = cat === 'other'

  const startLabel = isStay ? (cat === 'hotel' ? 'Entrada' : 'Recogida')
    : isInsurance ? 'Empieza la cobertura' : isEvent ? 'Fecha' : isTransport ? 'Salida' : 'Empieza'
  const endLabel = isStay ? (cat === 'hotel' ? 'Salida' : 'Devolución')
    : isInsurance ? 'Termina la cobertura' : isTransport ? 'Llegada' : 'Termina'

  async function onSubmit(values: FormValues) {
    const payload: NewDocument = {
      trip_id: tripId,
      title: values.title,
      category: values.category,
      confirmation_number: values.confirmation_number || null,
      locator: values.locator || null,
      provider: values.provider || null,
      link: values.link || null,
      datetime_start: join(values.start_date, values.start_time),
      datetime_end: join(values.end_date, values.end_time),
      origin: values.origin || null,
      destination: values.destination || null,
      seat: values.seat || null,
      flight_number: values.flight_number || null,
      phone: values.phone || null,
      notes: values.notes || null,
      file_url: fileUrl,
      back_url: fileUrl2,
      traveler_id: null,
    }
    try {
      const saved = doc
        ? await updateDoc.mutateAsync({ id: doc.id, ...payload })
        : await createDoc.mutateAsync(payload)
      // «Mostrar en el plan» no es una columna: gobierna la parada espejo del
      // itinerario. Solo las categorías con fecha (nunca los seguros).
      const show = canShowInItinerary(values.category) && !!values.show_in_itinerary
      if (show || saved.activity_id) {
        await syncReservation.mutateAsync({ doc: saved, showInItinerary: show })
      }
      onSaved(saved)
    } catch {
      // El aviso de error ya lo da la consulta.
    }
  }

  const trackBusy = (b: boolean) => setBusy(n => Math.max(0, n + (b ? 1 : -1)))

  // Localizador, asiento y trayecto: a la vista en los transportes; en «Otro», dentro de «Más detalles».
  const routeFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Localizador" optional hint="El código corto de la reserva.">
          <Input {...register('locator')} placeholder="ABC123" className="font-mono" autoCapitalize="characters" />
        </Field>
        <Field label="Asiento" optional>
          <Input {...register('seat')} placeholder="14A" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Origen" optional>
          <Input {...register('origin')} placeholder="Madrid" />
        </Field>
        <Field label="Destino" optional>
          <Input {...register('destination')} placeholder="París" />
        </Field>
      </div>
    </>
  )
  const phoneField = (
    <Field label={isInsurance ? 'Teléfono de asistencia' : 'Teléfono'} optional>
      <Input type="tel" {...register('phone')} placeholder="+34…" />
    </Field>
  )
  // Un enlace mal escrito no puede quedarse escondido.
  const showMore = more || !!errors.link

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Tipo">
        <Select {...register('category')}>
          {BOOKING_CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>

      <Field label="Título" error={errors.title?.message}>
        <Input {...register('title')} placeholder={isInsurance ? 'Ej.: Seguro de viaje' : 'Ej.: Vuelo Madrid → París'} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={isInsurance ? 'Aseguradora' : 'Compañía o web'} optional>
          <Input {...register('provider')} placeholder={isInsurance ? 'Mapfre…' : isStay ? 'Booking, Hertz…' : 'Iberia, Renfe…'} />
        </Field>
        <Field label={isInsurance ? 'N.º de póliza' : 'N.º de confirmación'} optional>
          <Input {...register('confirmation_number')} placeholder="000000000" />
        </Field>
      </div>

      {cat === 'flight' && (
        <Field label="Número de vuelo" optional>
          <Input {...register('flight_number')} placeholder="IB3456" className="font-mono" />
        </Field>
      )}

      {isTransport && routeFields}

      <div className="grid grid-cols-2 gap-4">
        <Field label={startLabel} optional>
          <Input type="date" {...register('start_date')} />
        </Field>
        <Field label="Hora" optional>
          <Input type="time" {...register('start_time')} />
        </Field>
      </div>
      {!isEvent && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={endLabel} optional>
            <Input type="date" {...register('end_date')} />
          </Field>
          <Field label="Hora" optional>
            <Input type="time" {...register('end_time')} />
          </Field>
        </div>
      )}

      {canShowInItinerary(cat) && (
        <Card sunken pad="sm">
          <SwitchRow
            label="Mostrar en el plan"
            description={startDate
              ? 'Saldrá como una parada el día de la reserva.'
              : 'Pon antes una fecha para poder colocarla en el plan.'}
            checked={!!startDate && !!showInItinerary}
            onCheckedChange={v => setValue('show_in_itinerary', v)}
            disabled={!startDate}
          />
        </Card>
      )}

      {(isStay || isInsurance) && phoneField}

      <FileField
        label={isInsurance ? 'Póliza' : 'Billete o reserva'}
        hint={isInsurance ? undefined : 'Si lleva un código QR o de barras, lo encontraremos para enseñarlo en grande.'}
        value={fileUrl}
        tripId={tripId}
        onChange={setFileUrl}
        onBusyChange={trackBusy}
      />

      <div className="border-t border-border pt-2">
        <Button variant="ghost" aria-expanded={showMore} onClick={() => setMore(v => !v)} className="-ml-3">
          <ChevronDown className={cn('transition-transform duration-200', !showMore && '-rotate-90')} aria-hidden="true" />
          Más detalles
        </Button>
        {!showMore && (
          <p className="text-xs text-muted-foreground">
            {isOther ? 'Localizador, trayecto, teléfono, enlace, otro archivo y notas.' : 'Enlace de la reserva, otro archivo y notas.'}
          </p>
        )}
        {/* Plegado sigue montado: lo escrito no se pierde al cerrar. */}
        <div className={cn('space-y-4 pt-2', !showMore && 'hidden')}>
          {isOther && routeFields}
          {isOther && phoneField}
          <Field label="Enlace de la reserva" optional error={errors.link?.message} hint="La página donde la gestionas (Booking, eDreams…).">
            <Input type="url" inputMode="url" {...register('link')} placeholder="https://…" />
          </Field>
          <FileField
            label={isInsurance ? 'Condiciones (opcional)' : 'Otro archivo (opcional)'}
            value={fileUrl2}
            tripId={tripId}
            onChange={setFileUrl2}
            onBusyChange={trackBusy}
          />
          <Field label="Notas" optional>
            <Textarea {...register('notes')} rows={2} placeholder="Lo que quieras recordar" />
          </Field>
        </div>
      </div>

      <PanelFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" form={formId} variant="primary" loading={isSubmitting} disabled={busy > 0}>
          {doc ? 'Guardar cambios' : 'Añadir'}
        </Button>
      </PanelFooter>
    </form>
  )
}
