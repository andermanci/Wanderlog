import { useEffect, useRef, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Upload, FileText, X, Paperclip } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationPicker, type LatLng } from '@/components/itinerary/LocationPicker'
import { useCreateActivity, useUpdateActivity } from '@/lib/queries/itinerary'
import { useTripAttachments, uploadAttachmentFile, useAddAttachment, useDeleteAttachment } from '@/lib/queries/attachments'
import { useAuthStore } from '@/store/authStore'
import type { Activity, ItineraryDay } from '@/types/database'
import { ACTIVITY_LABELS } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio'),
  type: z.enum(['flight', 'hotel', 'restaurant', 'activity', 'transport', 'place', 'other']),
  day_id: z.string().min(1),
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

interface ActivityFormDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
  days: ItineraryDay[]
  activity?: Activity | null
  defaultDayId?: string
  prefill?: Partial<Activity>
}

export function ActivityFormDialog({
  open, onClose, tripId, days, activity, defaultDayId, prefill,
}: ActivityFormDialogProps) {
  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()
  const { user } = useAuthStore()
  const { data: tripAttachments } = useTripAttachments(tripId)
  const addAttachment = useAddAttachment(tripId, activity?.id ?? '')
  const deleteAttachment = useDeleteAttachment(tripId)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [uploadingAtt, setUploadingAtt] = useState(false)
  // Coordenadas elegidas en el LocationPicker (dirección / origen / destino).
  const [coords, setCoords] = useState<{ address?: LatLng | null; origin?: LatLng | null; destination?: LatLng | null }>({})

  const attachments = (tripAttachments ?? []).filter(a => a.activity_id === activity?.id)

  async function handleAttachmentUpload(file: File) {
    if (!activity || !user) return
    if (file.size > 10 * 1024 * 1024) { return }
    setUploadingAtt(true)
    try {
      const url = await uploadAttachmentFile(file, user.id, tripId, activity.id)
      await addAttachment.mutateAsync({ name: file.name, file_url: url, mime: file.type || null })
    } finally {
      setUploadingAtt(false)
    }
  }

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { type: 'activity', day_id: defaultDayId ?? days[0]?.id ?? '' },
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
    } else if (prefill) {
      setCoords({
        address: prefill.lat != null && prefill.lng != null ? { lat: prefill.lat, lng: prefill.lng } : null,
      })
      reset({
        type: (prefill.type as FormValues['type']) ?? 'activity',
        day_id: defaultDayId ?? days[0]?.id ?? '',
        title: prefill.title ?? '',
        address: prefill.address ?? '',
        description: prefill.description ?? '',
        start_time: prefill.start_time ?? '',
        end_time: prefill.end_time ?? '',
        price: prefill.price ?? undefined,
        external_link: prefill.external_link ?? '',
        notes: prefill.notes ?? '',
      })
    } else {
      setCoords({})
      reset({ type: 'activity', day_id: defaultDayId ?? days[0]?.id ?? '' })
    }
  }, [activity, prefill, defaultDayId, days, reset, open])

  async function onSubmit(values: FormValues) {
    const isTransport = values.type === 'transport'
    const payload = {
      ...values,
      trip_id: tripId,
      day_id: values.day_id,
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
    } else {
      await createActivity.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{activity ? 'Editar actividad' : 'Nueva actividad'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input {...register('title')} placeholder="Ej: Visitar el Coliseo" />
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {days.map(d => (
                    <SelectItem key={d.id} value={d.id}>{formatDate(d.date, 'EEE dd MMM')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hora inicio</Label>
              <Input type="time" {...register('start_time')} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fin</Label>
              <Input type="time" {...register('end_time')} />
            </div>
          </div>

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

          {/* Adjuntos (entradas, QRs, PDFs) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Paperclip size={13} /> Entradas y documentos</Label>
            {!activity ? (
              <p className="text-xs text-muted-foreground">
                Guarda la actividad y vuelve a abrirla para adjuntar entradas, QRs o PDFs.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {attachments.map(att => {
                  const isImg = att.mime?.startsWith('image/') ?? /\.(png|jpe?g|webp)$/i.test(att.file_url)
                  return (
                    <div key={att.id} className="relative group">
                      <a href={att.file_url} target="_blank" rel="noreferrer" title={att.name}
                        className="block w-20 h-20 rounded-lg overflow-hidden border border-border">
                        {isImg ? (
                          <img src={att.file_url} alt={att.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1" style={{ background: 'var(--secondary)' }}>
                            <FileText size={20} style={{ color: 'var(--primary)' }} />
                            <span className="text-[9px] text-muted-foreground line-clamp-2 text-center">{att.name}</span>
                          </div>
                        )}
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteAttachment.mutate(att.id)}
                        title="Eliminar"
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-destructive hover:bg-destructive hover:text-white shadow transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => attachFileRef.current?.click()}
                  disabled={uploadingAtt}
                  className="w-20 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                >
                  {uploadingAtt ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  <span className="text-[10px]">{uploadingAtt ? 'Subiendo' : 'Añadir'}</span>
                </button>
                <input
                  ref={attachFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAttachmentUpload(file)
                    e.target.value = ''
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
              {activity ? 'Guardar' : 'Añadir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
