import { useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, X, ImageIcon } from 'lucide-react'
import { parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationPicker, type LatLng } from '@/components/itinerary/LocationPicker'
import { TripHeader } from '@/components/trips/TripHeader'
import { useCreateActivity, useUpdateActivity, useItineraryDays, useActivities, uploadActivityCover, rehostPlacePhoto } from '@/lib/queries/itinerary'
import { useAuthStore } from '@/store/authStore'
import { ACTIVITY_LABELS } from '@/lib/utils'
import { toast } from 'sonner'
import type { Activity, ItineraryDay } from '@/types/database'

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio'),
  type: z.enum(['flight', 'hotel', 'restaurant', 'activity', 'transport', 'place', 'other']),
  day_id: z.string().min(1, 'Elige un día'),
  end_day_id: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
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
  const isEdit = !!activityId
  const activity = activityId ? activities?.find(a => a.id === activityId) ?? null : null
  const loading = loadingDays || loadingActs

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
          isEdit={isEdit}
          defaultDayId={defaultDayId}
        />
      )}
    </div>
  )
}

function ActivityForm({ tripId, days, activity, isEdit, defaultDayId }: {
  tripId: string
  days: ItineraryDay[]
  activity: Activity | null
  isEdit: boolean
  defaultDayId?: string
}) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()

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
    if (activity) {
      await updateActivity.mutateAsync({ id: activity.id, ...payload })
      navigate(`/trips/${tripId}/itinerary/${activity.id}`, { replace: true })
    } else {
      const created = await createActivity.mutateAsync(payload)
      navigate(`/trips/${tripId}/itinerary/${created.id}`, { replace: true })
    }
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
          <Label>Precio (€)</Label>
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
        <Button type="submit" disabled={isSubmitting}
          variant="brand">
          {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
          {isEdit ? 'Guardar' : 'Añadir'}
        </Button>
      </div>
    </form>
  )
}
