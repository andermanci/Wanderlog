import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateActivity, useUpdateActivity } from '@/lib/queries/itinerary'
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

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { type: 'activity', day_id: defaultDayId ?? days[0]?.id ?? '' },
  })

  useEffect(() => {
    if (activity) {
      reset({
        title: activity.title,
        type: activity.type,
        day_id: activity.day_id,
        start_time: activity.start_time ?? '',
        end_time: activity.end_time ?? '',
        address: activity.address ?? '',
        description: activity.description ?? '',
        price: activity.price ?? undefined,
        external_link: activity.external_link ?? '',
        notes: activity.notes ?? '',
      })
    } else if (prefill) {
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
      reset({ type: 'activity', day_id: defaultDayId ?? days[0]?.id ?? '' })
    }
  }, [activity, prefill, defaultDayId, days, reset, open])

  async function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      trip_id: tripId,
      day_id: values.day_id,
      description: values.description ?? null,
      address: values.address ?? null,
      start_time: values.start_time || null,
      end_time: values.end_time || null,
      price: values.price ?? null,
      external_link: values.external_link || null,
      notes: values.notes ?? null,
      order_index: activity?.order_index ?? 0,
      place_id: activity?.place_id ?? null,
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
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

          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input {...register('address')} placeholder="Ej: Via Sacra, Roma" />
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

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}>
              {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
              {activity ? 'Guardar' : 'Añadir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
