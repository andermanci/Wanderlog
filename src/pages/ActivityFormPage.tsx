import { useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, X, ImageIcon, Plane, ChevronDown, Upload, File } from 'lucide-react'
import { parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationPicker, type LatLng } from '@/components/itinerary/LocationPicker'
import { TripHeader } from '@/components/trips/TripHeader'
import { useCreateActivity, useUpdateActivity, useItineraryDays, useActivities, uploadActivityCover, rehostPlacePhoto } from '@/lib/queries/itinerary'
import { useDocuments, useCreateDocument, useUpdateDocument, uploadDocumentFile } from '@/lib/queries/documents'
import { activityToDocFields } from '@/lib/reservationLink'
import { useAuthStore } from '@/store/authStore'
import { ACTIVITY_LABELS, currencySymbol } from '@/lib/utils'
import { useTrip } from '@/lib/queries/trips'
import { toast } from 'sonner'
import type { Activity, Document, ItineraryDay } from '@/types/database'

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio'),
  type: z.enum(['flight', 'hotel', 'restaurant', 'activity', 'transport', 'place', 'other']),
  day_id: z.string().min(1, 'Elige un día'),
  end_day_id: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  fixed_time: z.boolean().optional(),
  address: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  description: z.string().optional(),
  price: z.preprocess(v => (v === '' || v == null) ? undefined : Number(v), z.number().optional()),
  external_link: z.string().url('URL inválida').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// Página: carga datos y, SOLO cuando están listos, monta el formulario con sus
// valores ya calculados (con key por actividad). Así el tipo y demás campos
// salen correctos desde el primer render, sin reset() en efectos (que se
// pisaba con los refetch en segundo plano y dejaba el tipo vacío).
export function ActivityFormPage() {
  const { tripId, activityId } = useParams<{ tripId: string; activityId?: string }>()
  const [searchParams] = useSearchParams()
  const defaultDayId = searchParams.get('day') ?? undefined

  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId!)
  const { data: documents, isLoading: loadingDocs } = useDocuments(tripId!)
  const isEdit = !!activityId
  const activity = activityId ? activities?.find(a => a.id === activityId) ?? null : null
  // Reserva (documents) ya vinculada a esta actividad, para precargar sus datos.
  const linkedDoc = activityId ? documents?.find(d => d.activity_id === activityId) ?? null : null
  const loading = loadingDays || loadingActs || loadingDocs

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section={isEdit ? 'Editar actividad' : 'Nueva actividad'} />

      <div className="mb-6 space-y-3">
        <BackButton to={`/trips/${tripId}/itinerary`}>Itinerario</BackButton>
        <h1 className="font-serif text-2xl font-medium">{isEdit ? 'Editar actividad' : 'Nueva actividad'}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : isEdit && !activity ? (
        <p className="text-muted-foreground py-12 text-center">Actividad no encontrada.</p>
      ) : (
        <ActivityForm
          key={activityId ?? 'new'}
          tripId={tripId!}
          days={days ?? []}
          activity={activity}
          linkedDoc={linkedDoc}
          isEdit={isEdit}
          defaultDayId={defaultDayId}
        />
      )}
    </div>
  )
}

function ActivityForm({ tripId, days, activity, linkedDoc, isEdit, defaultDayId }: {
  tripId: string
  days: ItineraryDay[]
  activity: Activity | null
  linkedDoc: Document | null
  isEdit: boolean
  defaultDayId?: string
}) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: trip } = useTrip(tripId)
  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()

  // Datos de la reserva (documento) para vuelos. Se guardan aparte del formulario
  // zod (no son columnas de activities) y se precargan del documento vinculado.
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
  const resvFileRef = useRef<HTMLInputElement>(null)

  async function uploadReservationFile(file: File) {
    if (!user) return
    setResvUploading(true)
    try { setResvFileUrl(await uploadDocumentFile(file, user.id, tripId)) }
    catch { toast.error('No se pudo subir el archivo') }
    finally { setResvUploading(false) }
  }

  // Foto de portada (subida por el usuario o tomada de Google al asociar un lugar).
  const [coverUrl, setCoverUrl] = useState<string | null>(activity?.cover_image_url ?? null)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)

  async function uploadCover(file: File) {
    if (!user) return
    if (file.size > 10 * 1024 * 1024) { toast.error('La imagen supera 10 MB'); return }
    setCoverUploading(true)
    try { setCoverUrl(await uploadActivityCover(file, user.id, tripId)) }
    catch { toast.error('No se pudo subir la imagen') }
    finally { setCoverUploading(false) }
  }

  // La foto que trae Google al elegir el lugar se copia a nuestro Storage antes
  // de usarla: su URL original se cobra en cada render de la portada.
  async function applyGooglePhotoCover(photoUri: string) {
    if (!user) return
    setCoverUploading(true)
    try { setCoverUrl(await rehostPlacePhoto(photoUri, user.id, tripId)) }
    catch { /* sin portada automática: el usuario siempre puede subir una foto */ }
    finally { setCoverUploading(false) }
  }

  const [coords, setCoords] = useState<{ address?: LatLng | null; origin?: LatLng | null; destination?: LatLng | null }>(() => ({
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
    day_id: defaultDayId ?? days[0]?.id ?? '',
    end_day_id: '',
  }

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues,
  })

  // El selector de día es un calendario, pero el modelo usa day_id.
  const dayDate = (id?: string) => days.find(d => d.id === id)?.date ?? ''
  const dayIdForDate = (date: string) => days.find(d => d.date === date)?.id ?? ''
  const firstDate = days.length ? parseISO(days[0].date) : undefined
  const lastDate = days.length ? parseISO(days[days.length - 1].date) : undefined

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
      // Los vuelos y transportes ya son hora fija por definición: el tren no espera.
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
    let savedId: string
    if (activity) {
      await updateActivity.mutateAsync({ id: activity.id, ...payload })
      savedId = activity.id
    } else {
      const created = await createActivity.mutateAsync(payload)
      savedId = created.id
    }

    // Vuelo → mantener el documento vinculado (aparece en Documentos con el icono
    // de avión y sus datos de reserva). El documento es la ficha rica; la
    // actividad es su reflejo en el itinerario.
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

    navigate(`/trips/${tripId}/itinerary/${savedId}`, { replace: true })
  }

  const t = watch('type')
  const isMove = t === 'transport' || t === 'flight'
  const isHotel = t === 'hotel'
  const startLabel = isMove ? 'Hora salida' : isHotel ? 'Hora entrada' : 'Hora inicio'
  const endLabel = isMove ? 'Hora llegada' : isHotel ? 'Hora salida' : 'Hora fin'
  const endDayLabel = isMove ? 'Día de llegada' : isHotel ? 'Día de salida' : 'Día de fin'
  const depDate = dayDate(watch('day_id'))

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-xl p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="space-y-1.5">
        <Label>Título *</Label>
        <Input {...register('title')} placeholder="Ej: Visitar el Coliseo" autoFocus={!isEdit} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={watch('type')} onValueChange={(v) => setValue('type', v as FormValues['type'])}>
            {/* Renderizamos la etiqueta nosotros: Radix Select no siempre muestra
                el valor fijado por código si la lista aún no se ha abierto. */}
            <SelectTrigger><span>{ACTIVITY_LABELS[watch('type')] ?? 'Tipo'}</span></SelectTrigger>
            <SelectContent>
              {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Día</Label>
          <DatePicker
            value={dayDate(watch('day_id'))}
            onChange={(date) => { const id = dayIdForDate(date); if (id) setValue('day_id', id, { shouldValidate: true }) }}
            fromDate={firstDate}
            toDate={lastDate}
            placeholder="Elegir día"
          />
          {errors.day_id && <p className="text-xs text-destructive">{errors.day_id.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{startLabel}</Label>
          <Input type="time" {...register('start_time')} />
        </div>
        <div className="space-y-1.5">
          <Label>{endLabel}</Label>
          <Input type="time" {...register('end_time')} />
        </div>
      </div>

      {/* Hora fija: distingue una cita de un bloque aproximado. Solo las citas
          generan aviso si no da tiempo de llegar — si no, encadenar museos
          teñiría el día entero de rojo. Los vuelos y transportes ya lo son
          siempre, así que ahí no hace falta preguntar. */}
      {watch('start_time') && !isMove && (
        <label className="flex items-start gap-2.5 p-3 rounded-lg cursor-pointer"
          style={{ background: 'var(--secondary)' }}>
          <Checkbox
            className="mt-0.5"
            checked={watch('fixed_time') ?? false}
            onCheckedChange={(v) => setValue('fixed_time', v === true)}
          />
          <span className="min-w-0">
            <span className="text-sm font-medium block">Hora fija</span>
            <span className="text-xs text-muted-foreground">
              Tengo entrada o reserva a esa hora. Te avisaré si no te da tiempo de llegar.
            </span>
          </span>
        </label>
      )}

      <div className="space-y-1.5">
        <Label>{endDayLabel} <span className="text-muted-foreground font-normal">(si termina otro día)</span></Label>
        <div className="flex gap-2">
          <DatePicker
            className="flex-1"
            value={dayDate(watch('end_day_id'))}
            onChange={(date) => setValue('end_day_id', dayIdForDate(date))}
            fromDate={depDate ? parseISO(depDate) : firstDate}
            toDate={lastDate}
            placeholder="Mismo día"
          />
          {watch('end_day_id') && (
            <Button type="button" variant="ghost" size="icon" className="flex-shrink-0" aria-label="Mismo día" title="Mismo día"
              onClick={() => setValue('end_day_id', '')}>
              <X size={15} />
            </Button>
          )}
        </div>
      </div>

      {isMove ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Origen</Label>
            <LocationPicker
              value={watch('origin')}
              onChange={(v, c) => { setValue('origin', v, { shouldDirty: true }); setCoords(prev => ({ ...prev, origin: c ?? null })) }}
              placeholder={t === 'flight' ? 'Aeropuerto / ciudad de salida' : 'Punto de salida'}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Destino</Label>
            <LocationPicker
              value={watch('destination')}
              onChange={(v, c) => { setValue('destination', v, { shouldDirty: true }); setCoords(prev => ({ ...prev, destination: c ?? null })) }}
              placeholder={t === 'flight' ? 'Aeropuerto / ciudad de llegada' : 'Punto de llegada'}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <LocationPicker
            value={watch('address')}
            onChange={(v, c, meta) => {
              setValue('address', v, { shouldDirty: true })
              setCoords(prev => ({ ...prev, address: c ?? null }))
              // Si el lugar trae foto de Google y aún no hay portada, la usamos.
              if (meta?.photoUrl && !coverUrl) applyGooglePhotoCover(meta.photoUrl)
            }}
            placeholder="Buscar o elegir en el mapa"
          />
        </div>
      )}

      {/* Datos de la reserva (documento) — solo vuelos. Al guardar se crea/actualiza
          un documento de categoría 'flight' vinculado, que aparece en Documentos. */}
      {t === 'flight' && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button type="button" onClick={() => setResvOpen(o => !o)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary">
            <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
              <Plane size={16} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium block">Datos de la reserva</span>
              <span className="text-xs text-muted-foreground">Localizador, aerolínea, asiento y billete (opcional)</span>
            </span>
            <ChevronDown size={16} className="text-muted-foreground transition-transform flex-shrink-0"
              style={{ transform: resvOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
          </button>
          {resvOpen && (
            <div className="p-3 pt-1 space-y-3 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Número de vuelo</Label>
                  <Input value={resv.flight_number} onChange={(e) => setResv(r => ({ ...r, flight_number: e.target.value }))} placeholder="IB3456" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Aerolínea</Label>
                  <Input value={resv.provider} onChange={(e) => setResv(r => ({ ...r, provider: e.target.value }))} placeholder="Iberia" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Localizador</Label>
                  <Input value={resv.locator} onChange={(e) => setResv(r => ({ ...r, locator: e.target.value }))} placeholder="ABC123" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nº de confirmación</Label>
                  <Input value={resv.confirmation_number} onChange={(e) => setResv(r => ({ ...r, confirmation_number: e.target.value }))} placeholder="…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Asiento</Label>
                <Input value={resv.seat} onChange={(e) => setResv(r => ({ ...r, seat: e.target.value }))} placeholder="12A" />
              </div>
              <div className="space-y-1.5">
                <Label>Enlace de la reserva</Label>
                <Input value={resv.link} onChange={(e) => setResv(r => ({ ...r, link: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label>Billete (PDF o imagen)</Label>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary transition-colors"
                  onClick={() => resvFileRef.current?.click()}>
                  {resvUploading ? <Loader2 size={16} className="animate-spin" /> : resvFileUrl ? <File size={16} style={{ color: 'var(--primary)' }} /> : <Upload size={16} className="text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">{resvUploading ? 'Subiendo...' : resvFileUrl ? 'Billete subido ✓' : 'Subir billete'}</span>
                  {resvFileUrl && !resvUploading && (
                    <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setResvFileUrl(null) }}>Quitar</button>
                  )}
                </div>
                <input ref={resvFileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReservationFile(f); e.target.value = '' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Foto de portada (para visualizar la actividad en el itinerario) */}
      <div className="space-y-1.5">
        <Label>Foto</Label>
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = '' }}
        />
        {coverUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border">
            <img src={coverUrl} alt="Portada" className="w-full h-36 object-cover" />
            <div className="absolute top-1.5 right-1.5 flex gap-1.5">
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => coverRef.current?.click()}>
                Cambiar
              </Button>
              <Button type="button" size="icon" variant="secondary" className="w-7 h-7" onClick={() => setCoverUrl(null)} aria-label="Quitar" title="Quitar">
                <X size={13} />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={coverUploading}
            className="w-full h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {coverUploading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
            <span className="text-xs">{coverUploading ? 'Subiendo…' : 'Añadir una foto'}</span>
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea {...register('description')} rows={2} placeholder="Detalles de la actividad..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Precio ({currencySymbol(trip?.default_currency ?? undefined)})</Label>
          <Input type="number" step="0.01" {...register('price')} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label>Enlace externo</Label>
          <Input {...register('external_link')} placeholder="https://..." />
          {errors.external_link && <p className="text-xs text-destructive">{errors.external_link.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea {...register('notes')} rows={2} placeholder="Notas adicionales..." />
      </div>

      {!isEdit && (
        <p className="text-xs text-muted-foreground">
          Las entradas y QRs se adjuntan después, desde el detalle de la actividad.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" asChild>
          <Link to={`/trips/${tripId}/itinerary`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting || resvUploading}
          variant="brand">
          {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
          {isEdit ? 'Guardar' : 'Añadir'}
        </Button>
      </div>
    </form>
  )
}
