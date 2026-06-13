import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationPicker, type LatLng } from '@/components/itinerary/LocationPicker'
import { TripHeader } from '@/components/trips/TripHeader'
import { useCreateActivity, useUpdateActivity, useItineraryDays, useActivities } from '@/lib/queries/itinerary'
import { ACTIVITY_LABELS, formatDate } from '@/lib/utils'

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

// Página de crear/editar actividad (antes era un modal: demasiado grande y
// abría el selector de ubicación como modal-sobre-modal).
export function ActivityFormPage() {
  const { tripId, activityId } = useParams<{ tripId: string; activityId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultDayId = searchParams.get('day') ?? undefined

  const { data: days, isLoading: loadingDays } = useItineraryDays(tripId!)
  const { data: activities, isLoading: loadingActs } = useActivities(tripId!)
  const activity = activityId ? activities?.find(a => a.id === activityId) ?? null : null
  const isEdit = !!activityId

  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()
  const [coords, setCoords] = useState<{ address?: LatLng | null; origin?: LatLng | null; destination?: LatLng | null }>({})

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { type: 'activity', day_id: defaultDayId ?? '' },
  })

  useEffect(() => {
    if (activity) {
      setCoords({
        address: activity.lat != null && activity.lng != null ? { lat: activity.lat, lng: activity.lng } : null,
        origin: activity.origin_lat != null && activity.origin_lng != null ? { lat: activity.origin_lat, lng: activity.origin_lng } : null,
        destination: activity.destination_lat != null && activity.destination_lng != null ? { lat: activity.destination_lat, lng: activity.destination_lng } : null,
      })
      reset({
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
      })
    } else if (!isEdit && days?.length) {
      reset({ type: 'activity', day_id: defaultDayId ?? days[0].id })
    }
  }, [activity, isEdit, days, defaultDayId, reset])

  async function onSubmit(values: FormValues) {
    const isTransport = values.type === 'transport'
    const payload = {
      ...values,
      trip_id: tripId!,
      day_id: values.day_id,
      // Solo guardamos día de llegada si es distinto del de salida.
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

  const loading = loadingDays || loadingActs

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section={isEdit ? 'Editar actividad' : 'Nueva actividad'} />

      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="w-8 h-8" asChild>
          <Link to={`/trips/${tripId}/itinerary`}><ArrowLeft size={16} /></Link>
        </Button>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Día</Label>
              <Select value={watch('day_id')} onValueChange={(v) => setValue('day_id', v)}>
                <SelectTrigger><SelectValue placeholder="Elegir día" /></SelectTrigger>
                <SelectContent>
                  {days?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{formatDate(d.date, 'EEE dd MMM')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.day_id && <p className="text-xs text-destructive">{errors.day_id.message}</p>}
            </div>
          </div>

          {(() => {
            const isMove = watch('type') === 'transport' || watch('type') === 'flight'
            return (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{isMove ? 'Hora salida' : 'Hora inicio'}</Label>
                    <Input type="time" {...register('start_time')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isMove ? 'Hora llegada' : 'Hora fin'}</Label>
                    <Input type="time" {...register('end_time')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Día de llegada <span className="text-muted-foreground font-normal">(si termina otro día)</span></Label>
                  <Select value={watch('end_day_id') || 'same'} onValueChange={(v) => setValue('end_day_id', v === 'same' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">Mismo día</SelectItem>
                      {days?.map(d => (
                        <SelectItem key={d.id} value={d.id}>{formatDate(d.date, 'EEE dd MMM')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )
          })()}

          {watch('type') === 'transport' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Origen</Label>
                <LocationPicker
                  value={watch('origin')}
                  onChange={(v, c) => { setValue('origin', v, { shouldDirty: true }); setCoords(prev => ({ ...prev, origin: c ?? null })) }}
                  placeholder="Punto de salida"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Destino</Label>
                <LocationPicker
                  value={watch('destination')}
                  onChange={(v, c) => { setValue('destination', v, { shouldDirty: true }); setCoords(prev => ({ ...prev, destination: c ?? null })) }}
                  placeholder="Punto de llegada"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <LocationPicker
                value={watch('address')}
                onChange={(v, c) => { setValue('address', v, { shouldDirty: true }); setCoords(prev => ({ ...prev, address: c ?? null })) }}
                placeholder="Buscar o elegir en el mapa"
              />
            </div>
          )}

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
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
              {isEdit ? 'Guardar' : 'Añadir'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
