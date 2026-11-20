import { useId, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarPlus, ChevronDown, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { ActivityIcon, Button, Field, Input, Notice, Select, Spinner, SwitchRow, Textarea } from '@/design'
import { FileField } from '@/features/wallet/FileField'
import {
  displayCover, rehostPlacePhoto, uploadActivityCover, useCreateActivity, useUpdateActivity,
} from '@/lib/queries/itinerary'
import { useCreateDocument, useUpdateDocument } from '@/lib/queries/documents'
import { useTrip } from '@/lib/queries/trips'
import { activityToDocFields } from '@/lib/reservationLink'
import { ACTIVITY_LABELS, cn, currencySymbol, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { Activity, Document, ItineraryDay } from '@/types/database'
import { LocationField, LocationPickerStep, type LatLng } from './LocationPicker'
import { PanelFooter } from './PanelFooter'

const TYPES = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'place', 'other'] as const

const schema = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre.'),
  type: z.enum(TYPES),
  day_id: z.string().min(1, 'Elige un día.'),
  end_day_id: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  fixed_time: z.boolean().optional(),
  address: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  description: z.string().optional(),
  price: z.preprocess(v => (v === '' || v == null) ? undefined : Number(v), z.number().optional()),
  external_link: z.string().url('Tiene que ser una dirección web completa, con https://').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/** Qué ubicación se está eligiendo en el paso del mapa. */
export type PickTarget = 'address' | 'origin' | 'destination'

const PICK_FIELD: Record<PickTarget, 'address' | 'origin' | 'destination'> = {
  address: 'address', origin: 'origin', destination: 'destination',
}

const FORM_ID = 'activity-form'

interface ActivityFormProps {
  tripId: string
  days: ItineraryDay[]
  /** La actividad que se edita; null al crear. */
  activity: Activity | null
  /** Reserva (documento) ya vinculada, para precargar sus datos. */
  linkedDoc: Document | null
  defaultDayId?: string
  /** Paso «elegir ubicación» abierto (lo gobierna el panel, que pinta su título y su «atrás»). */
  pick: PickTarget | null
  onPick: (target: PickTarget | null) => void
  onCancel: () => void
  onSaved: (activityId: string, dayId: string) => void
}

// El formulario se monta SOLO cuando los datos están listos, con sus valores ya
// calculados (y `key` por actividad). Así el tipo y los demás campos salen bien
// desde el primer render, sin reset() en efectos que se pisen con los refetch.
export function ActivityForm({
  tripId, days, activity, linkedDoc, defaultDayId, pick, onPick, onCancel, onSaved,
}: ActivityFormProps) {
  const isEdit = !!activity
  const { user } = useAuthStore()
  const { data: trip } = useTrip(tripId)
  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()

  // Datos de la reserva (documento) de los vuelos. Van aparte del formulario
  // (no son columnas de la actividad) y se precargan del documento vinculado.
  const [resv, setResv] = useState(() => ({
    locator: linkedDoc?.locator ?? '',
    provider: linkedDoc?.provider ?? '',
    confirmation_number: linkedDoc?.confirmation_number ?? '',
    seat: linkedDoc?.seat ?? '',
    flight_number: linkedDoc?.flight_number ?? '',
    link: linkedDoc?.link ?? '',
  }))
  const [resvFileUrl, setResvFileUrl] = useState<string | null>(linkedDoc?.file_url ?? null)
  const [resvUploading, setResvUploading] = useState(false)
  const [resvOpen, setResvOpen] = useState(!!linkedDoc)

  // Foto de portada (subida por la persona o tomada de Google al elegir el sitio).
  const [coverUrl, setCoverUrl] = useState<string | null>(activity?.cover_image_url ?? null)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)

  async function uploadCover(file: File) {
    if (!user) return
    if (file.size > 10 * 1024 * 1024) { toast.error('La imagen pesa más de 10 MB. Elige una más ligera.'); return }
    setCoverUploading(true)
    try { setCoverUrl(await uploadActivityCover(file, user.id, tripId)) }
    catch { toast.error('No se ha podido subir la imagen.') }
    finally { setCoverUploading(false) }
  }

  // La foto que trae Google al elegir el sitio se copia a nuestro Storage antes
  // de usarla: su URL original se cobra cada vez que se pinta la portada.
  async function applyGooglePhotoCover(photoUri: string) {
    if (!user) return
    setCoverUploading(true)
    try { setCoverUrl(await rehostPlacePhoto(photoUri, user.id, tripId)) }
    catch { /* sin portada automática: siempre se puede subir una foto */ }
    finally { setCoverUploading(false) }
  }

  const [coords, setCoords] = useState<Record<PickTarget, LatLng | null>>(() => ({
    address: activity?.lat != null && activity?.lng != null ? { lat: activity.lat, lng: activity.lng } : null,
    origin: activity?.origin_lat != null && activity?.origin_lng != null ? { lat: activity.origin_lat, lng: activity.origin_lng } : null,
    destination: activity?.destination_lat != null && activity?.destination_lng != null ? { lat: activity.destination_lat, lng: activity.destination_lng } : null,
  }))

  // Valores iniciales calculados desde la actividad (o genéricos para una nueva).
  const defaultValues: FormValues = activity ? {
    title: activity.title,
    type: activity.type,
    day_id: activity.day_id,
    end_day_id: activity.end_day_id ?? '',
    start_time: activity.start_time ?? '',
    end_time: activity.end_time ?? '',
    fixed_time: activity.fixed_time,
    address: activity.address ?? '',
    origin: activity.origin ?? '',
    destination: activity.destination ?? '',
    description: activity.description ?? '',
    price: activity.price ?? undefined,
    external_link: activity.external_link ?? '',
    notes: activity.notes ?? '',
  } : {
    title: '',
    type: 'activity',
    day_id: (defaultDayId && days.some(d => d.id === defaultDayId) ? defaultDayId : days[0]?.id) ?? '',
    end_day_id: '',
  }

  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues,
  })
  const w = useWatch({ control })

  // Lo opcional va plegado: crear algo rápido son tres campos.
  const [moreOpen, setMoreOpen] = useState(() => !!activity && !!(
    activity.cover_image_url || activity.description || activity.price != null || activity.external_link || activity.notes
  ))

  const [endDayOpen, setEndDayOpen] = useState(false)

  async function onSubmit(values: FormValues) {
    // Vuelo y transporte = movimiento A→B (origen/destino); el resto, dirección.
    const isTransport = values.type === 'transport' || values.type === 'flight'
    const payload = {
      ...values,
      trip_id: tripId,
      day_id: values.day_id,
      end_day_id: values.end_day_id && values.end_day_id !== values.day_id ? values.end_day_id : null,
      description: values.description ?? null,
      address: values.address || null,
      origin: values.origin || null,
      destination: values.destination || null,
      start_time: values.start_time || null,
      end_time: values.end_time || null,
      // Los vuelos y transportes ya son de hora fija por definición: el tren no espera.
      fixed_time: isTransport || !!values.fixed_time,
      price: values.price ?? null,
      external_link: values.external_link || null,
      notes: values.notes ?? null,
      order_index: activity?.order_index ?? 0,
      place_id: activity?.place_id ?? null,
      cover_image_url: coverUrl,
      lat: !isTransport && values.address ? coords.address?.lat ?? null : null,
      lng: !isTransport && values.address ? coords.address?.lng ?? null : null,
      origin_lat: isTransport && values.origin ? coords.origin?.lat ?? null : null,
      origin_lng: isTransport && values.origin ? coords.origin?.lng ?? null : null,
      destination_lat: isTransport && values.destination ? coords.destination?.lat ?? null : null,
      destination_lng: isTransport && values.destination ? coords.destination?.lng ?? null : null,
    }
    try {
      let savedId: string
      if (activity) {
        await updateActivity.mutateAsync({ id: activity.id, ...payload })
        savedId = activity.id
      } else {
        const created = await createActivity.mutateAsync(payload)
        savedId = created.id
      }

      // Vuelo → se mantiene su documento vinculado (sale en la Cartera con el
      // icono de avión y sus datos de reserva). El documento es la ficha
      // completa; la actividad es su reflejo en el plan.
      if (values.type === 'flight') {
        const dayDateById = new Map(days.map(d => [d.id, d.date]))
        const docFields = activityToDocFields(
          { type: 'flight', title: payload.title, origin: payload.origin, destination: payload.destination,
            day_id: payload.day_id, end_day_id: payload.end_day_id, start_time: payload.start_time, end_time: payload.end_time },
          dayDateById,
          { ...resv, file_url: resvFileUrl },
        )
        if (linkedDoc) {
          await updateDoc.mutateAsync({ id: linkedDoc.id, ...docFields, activity_id: savedId })
        } else {
          await createDoc.mutateAsync({ trip_id: tripId, activity_id: savedId, traveler_id: null, phone: null, notes: null, ...docFields })
        }
      }

      onSaved(savedId, payload.day_id)
    } catch {
      // El aviso ya lo da cada mutación; el formulario se queda abierto con lo escrito.
    }
  }

  const t = w.type ?? 'activity'
  const isMove = t === 'transport' || t === 'flight'
  const isHotel = t === 'hotel'
  const startLabel = isMove ? 'Hora de salida' : isHotel ? 'Hora de entrada' : 'Empieza a las'
  const endLabel = isMove ? 'Hora de llegada' : isHotel ? 'Hora de salida' : 'Termina a las'
  const endDayLabel = isMove ? 'Día de llegada' : isHotel ? 'Día de salida' : 'Día en que termina'
  const showEndDay = isMove || isHotel || !!w.end_day_id || endDayOpen
  const depDate = days.find(d => d.id === w.day_id)?.date ?? ''
  const endDayOptions = days.filter(d => d.date > depDate || d.id === w.end_day_id)
  const dayLabel = (d: ItineraryDay) => {
    const date = formatDate(d.date, 'EEEE d MMM')
    return `${date.charAt(0).toUpperCase()}${date.slice(1)} · Día ${days.indexOf(d) + 1}`
  }
  const coverShown = displayCover(coverUrl)
  const currency = currencySymbol(trip?.default_currency ?? undefined)

  const setResvField = (k: keyof typeof resv) => (e: { target: { value: string } }) =>
    setResv(r => ({ ...r, [k]: e.target.value }))

  return (
    <>
      {/* Paso «elegir ubicación»: sustituye al formulario a la vista, que sigue
          montado debajo para no perder lo escrito. */}
      {pick && (
        <LocationPickerStep
          key={pick}
          initial={w[PICK_FIELD[pick]] || undefined}
          initialCoords={coords[pick]}
          onCancel={() => onPick(null)}
          onPick={(address, c, meta) => {
            setValue(PICK_FIELD[pick], address, { shouldDirty: true })
            setCoords(prev => ({ ...prev, [pick]: c }))
            // Si el sitio trae foto de Google y aún no hay portada, se usa.
            if (pick === 'address' && meta.photoUrl && !coverUrl) void applyGooglePhotoCover(meta.photoUrl)
            onPick(null)
          }}
        />
      )}

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} hidden={!!pick} noValidate className="space-y-8">
        {days.length === 0 && (
          <Notice tone="warning" title="Este viaje aún no tiene días">
            Pon las fechas del viaje para poder colocar cosas en el plan.
          </Notice>
        )}

        <FormSection title="Lo básico">
          <TypeGrid value={t} onChange={v => setValue('type', v, { shouldDirty: true })} />

          <Field label="Nombre" error={errors.title?.message}>
            <Input {...register('title')} placeholder={TITLE_HINT[t]} autoFocus={!isEdit} autoComplete="off" />
          </Field>

          <Field label={isMove ? 'Día de salida' : isHotel ? 'Día de entrada' : 'Día'} error={errors.day_id?.message}>
            <Select {...register('day_id')}>
              {!w.day_id && <option value="">Elige un día</option>}
              {days.map(d => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={startLabel} optional>
              <Input type="time" {...register('start_time')} />
            </Field>
            <Field label={endLabel} optional>
              <Input type="time" {...register('end_time')} />
            </Field>
          </div>

          {/* Hora fija: distingue una cita de un rato aproximado. Solo las citas
              avisan si no da tiempo a llegar; si no, encadenar museos teñiría el
              día entero de avisos. Vuelos y transportes lo son siempre. */}
          {w.start_time && !isMove && (
            <div className="rounded-xl bg-sunken px-4 py-2.5">
              <SwitchRow
                label="Tengo que estar a esa hora"
                description="Para entradas y reservas con hora. Te avisaremos si no te da tiempo a llegar."
                checked={w.fixed_time ?? false}
                onCheckedChange={v => setValue('fixed_time', v, { shouldDirty: true })}
              />
            </div>
          )}

          {/* Vuelos, transportes y hoteles suelen acabar otro día; lo demás casi nunca,
              así que ahí el campo espera detrás de un botón. */}
          {endDayOptions.length > 0 && (showEndDay ? (
            <Field label={endDayLabel} hint={isHotel ? 'El día que dejas el hotel.' : 'Cámbialo solo si acaba otro día.'}>
              <Select {...register('end_day_id')}>
                <option value="">El mismo día</option>
                {endDayOptions.map(d => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
              </Select>
            </Field>
          ) : (
            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setEndDayOpen(true)}>
              <CalendarPlus /> Termina otro día
            </Button>
          ))}
        </FormSection>

        <FormSection title="Dónde" hint="Opcional. Con una ubicación, sale en el mapa y podemos calcular los trayectos.">
          {isMove ? (
            <>
              <LocationField
                label="Sale de"
                value={w.origin}
                placeholder={t === 'flight' ? 'Aeropuerto o ciudad de salida' : 'Punto de salida'}
                onOpen={() => onPick('origin')}
                onClear={() => { setValue('origin', '', { shouldDirty: true }); setCoords(p => ({ ...p, origin: null })) }}
              />
              <LocationField
                label="Llega a"
                value={w.destination}
                placeholder={t === 'flight' ? 'Aeropuerto o ciudad de llegada' : 'Punto de llegada'}
                onOpen={() => onPick('destination')}
                onClear={() => { setValue('destination', '', { shouldDirty: true }); setCoords(p => ({ ...p, destination: null })) }}
              />
            </>
          ) : (
            <LocationField
              label="Dirección"
              value={w.address}
              onOpen={() => onPick('address')}
              onClear={() => { setValue('address', '', { shouldDirty: true }); setCoords(p => ({ ...p, address: null })) }}
            />
          )}
        </FormSection>

        {/* Datos de la reserva: solo vuelos. Al guardar se crea o actualiza un
            documento vinculado, que aparece en la Cartera. */}
        {t === 'flight' && (
          <Fold
            title="Reserva"
            hint="Número de vuelo, localizador, asiento y billete. Se guarda también en la Cartera."
            open={resvOpen}
            onToggle={() => setResvOpen(o => !o)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número de vuelo">
                <Input value={resv.flight_number} onChange={setResvField('flight_number')} placeholder="IB3456" className="font-mono" autoCapitalize="characters" />
              </Field>
              <Field label="Aerolínea">
                <Input value={resv.provider} onChange={setResvField('provider')} placeholder="Iberia" />
              </Field>
              <Field label="Localizador">
                <Input value={resv.locator} onChange={setResvField('locator')} placeholder="ABC123" className="font-mono" autoCapitalize="characters" />
              </Field>
              <Field label="N.º de confirmación">
                <Input value={resv.confirmation_number} onChange={setResvField('confirmation_number')} />
              </Field>
            </div>
            <Field label="Asiento">
              <Input value={resv.seat} onChange={setResvField('seat')} placeholder="12A" />
            </Field>
            <Field label="Enlace de la reserva">
              <Input value={resv.link} onChange={setResvField('link')} placeholder="https://…" inputMode="url" />
            </Field>
            <FileField
              label="Billete"
              hint="En PDF o imagen. Podrás enseñarlo desde la actividad y desde la Cartera."
              value={resvFileUrl}
              tripId={tripId}
              onChange={setResvFileUrl}
              onBusyChange={setResvUploading}
            />
          </Fold>
        )}

        <Fold
          title="Más detalles"
          hint="Foto, descripción, precio, enlace y notas."
          open={moreOpen || !!errors.external_link}
          onToggle={() => setMoreOpen(o => !o)}
        >
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Foto</p>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Foto de la actividad"
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = '' }}
            />
            {coverShown && !coverUploading ? (
              <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={coverShown} alt="Foto elegida" className="h-40 w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <Button variant="photo" size="sm" onClick={() => coverRef.current?.click()}>Cambiar</Button>
                  <Button variant="photo" size="sm" onClick={() => setCoverUrl(null)}>Quitar</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                disabled={coverUploading}
                className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-card text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
              >
                {coverUploading ? <Spinner label="Subiendo" /> : <ImagePlus className="size-6" aria-hidden="true" />}
                {coverUploading ? 'Subiendo…' : 'Añadir una foto'}
              </button>
            )}
          </div>

          <Field label="Descripción">
            <Textarea {...register('description')} rows={2} placeholder="Qué es, qué vais a hacer…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Precio (${currency})`}>
              <Input type="number" step="0.01" inputMode="decimal" {...register('price')} placeholder="0,00" />
            </Field>
            <Field label="Enlace" error={errors.external_link?.message}>
              <Input {...register('external_link')} placeholder="https://…" inputMode="url" />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea {...register('notes')} rows={2} placeholder="Algo que no quieras olvidar" />
          </Field>
        </Fold>

        {!isEdit && (
          <p className="text-sm text-muted-foreground">
            Las entradas y los códigos QR se añaden después, al abrir la actividad.
          </p>
        )}
      </form>

      {!pick && (
        <PanelFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button
            type="submit" form={FORM_ID} variant="primary"
            loading={isSubmitting} disabled={resvUploading || coverUploading}
          >
            {isEdit ? 'Guardar cambios' : 'Añadir al plan'}
          </Button>
        </PanelFooter>
      )}
    </>
  )
}

const TITLE_HINT: Record<string, string> = {
  flight: 'Ej.: Vuelo a Roma',
  hotel: 'Ej.: Hotel Colosseo',
  restaurant: 'Ej.: Cena en Trastevere',
  activity: 'Ej.: Visita al Coliseo',
  transport: 'Ej.: Tren a Florencia',
  place: 'Ej.: Fontana di Trevi',
  other: 'Ej.: Recoger las llaves',
}

/** El tipo, como rejilla de botones grandes: se ve todo de un vistazo y se elige con un toque. */
function TypeGrid({ value, onChange }: { value: string; onChange: (type: FormValues['type']) => void }) {
  return (
    <div className="space-y-1.5">
      <p id="activity-type-label" className="text-sm font-medium text-foreground">¿Qué es?</p>
      <div role="radiogroup" aria-labelledby="activity-type-label" className="grid grid-cols-4 gap-2">
        {TYPES.map(type => {
          const selected = type === value
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              data-tone={type}
              onClick={() => onChange(type)}
              className={cn(
                'flex min-h-18 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-medium transition-colors duration-150 active:scale-[0.97]',
                selected
                  ? 'border-tone bg-tone-soft text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              <ActivityIcon type={type} className={cn('size-5.5', selected && 'text-tone')} />
              <span className="max-w-full truncate">{ACTIVITY_LABELS[type]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="title-card">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Sección opcional que se despliega al pulsar su cabecera. */
function Fold({ title, hint, open, onToggle, children }: {
  title: string
  hint: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="rounded-2xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-15 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-secondary/70"
      >
        <span className="min-w-0 flex-1">
          <span className="title-card block">{title}</span>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div id={id} className="space-y-4 border-t border-border p-4">{children}</div>}
    </section>
  )
}
