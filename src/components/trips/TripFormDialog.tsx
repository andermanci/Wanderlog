import { useEffect, useRef, useState } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useCreateTrip, useUpdateTrip } from '@/lib/queries/trips'
import { currencySymbol } from '@/lib/utils'
import type { Trip } from '@/types/database'
import { toast } from 'sonner'

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  destination: z.string().min(1, 'El destino es obligatorio'),
  description: z.string().optional(),
  start_date: z.string().min(1, 'La fecha de inicio es obligatoria'),
  end_date: z.string().min(1, 'La fecha de fin es obligatoria'),
  status: z.enum(['planning', 'confirmed', 'in_progress', 'completed']),
  budget_total: z.preprocess(v => (v === '' || v == null) ? undefined : Number(v), z.number().positive().optional()),
})

type FormValues = z.infer<typeof schema>

interface TripFormDialogProps {
  open: boolean
  onClose: () => void
  trip?: Trip | null
}

export function TripFormDialog({ open, onClose, trip }: TripFormDialogProps) {
  const { user, profile } = useAuthStore()
  const createTrip = useCreateTrip()
  const updateTrip = useUpdateTrip()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const { register, handleSubmit, reset, setValue, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { status: 'planning' },
  })

  useEffect(() => {
    if (trip) {
      reset({
        name: trip.name,
        destination: trip.destination,
        description: trip.description ?? '',
        start_date: trip.start_date,
        end_date: trip.end_date,
        status: trip.status,
        budget_total: trip.budget_total ?? undefined,
      })
      setCoverUrl(trip.cover_image_url)
      setTags(trip.tags)
    } else {
      reset({ status: 'planning' })
      setCoverUrl(null)
      setTags([])
    }
  }, [trip, reset, open])

  async function handleImageUpload(file: File) {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen supera 5 MB. Elige una más ligera.')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 30000)
      )
      const { error } = await Promise.race([
        supabase.storage.from('trip-covers').upload(path, file, { upsert: true }),
        timeout,
      ])
      if (error) throw error
      const { data } = supabase.storage.from('trip-covers').getPublicUrl(path)
      setCoverUrl(data.publicUrl)
    } catch (err) {
      console.error('[TripFormDialog] upload error:', err)
      const msg = err instanceof Error && err.message === 'timeout'
        ? 'La subida tardó demasiado. Comprueba tu conexión.'
        : 'Error al subir la imagen'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  function addTag(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const t = tagInput.trim()
      if (t && !tags.includes(t)) setTags(prev => [...prev, t])
      setTagInput('')
    }
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      description: values.description ?? null,
      budget_total: values.budget_total ?? null,
      tags,
      cover_image_url: coverUrl,
    }
    if (trip) {
      await updateTrip.mutateAsync({ id: trip.id, ...payload })
    } else {
      await createTrip.mutateAsync(payload as Parameters<typeof createTrip.mutateAsync>[0])
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{trip ? 'Editar viaje' : 'Nuevo viaje'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Cover image */}
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Foto de portada</Label>
            <div
              className="relative h-32 rounded-lg overflow-hidden cursor-pointer flex items-center justify-center border border-dashed border-border hover:border-primary transition-colors"
              style={{ background: 'var(--secondary)' }}
              onClick={() => fileRef.current?.click()}
            >
              {coverUrl
                ? <img src={coverUrl} alt="Portada" className="w-full h-full object-cover" />
                : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {uploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                    <span className="text-xs">{uploading ? 'Subiendo...' : 'Subir imagen'}</span>
                  </div>
                )
              }
              {coverUrl && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCoverUrl(null) }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nombre del viaje *</Label>
            <Input {...register('name')} placeholder="Ej: Tokio 2025" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <Label>Destino *</Label>
            <Input {...register('destination')} placeholder="Ej: Tokio, Japón" />
            {errors.destination && <p className="text-xs text-destructive">{errors.destination.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea {...register('description')} placeholder="Notas sobre el viaje..." rows={2} />
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha inicio *</Label>
              <Controller
                control={control}
                name="start_date"
                render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} placeholder="Fecha inicio" />
                )}
              />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fecha fin *</Label>
              <Controller
                control={control}
                name="end_date"
                render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} placeholder="Fecha fin" />
                )}
              />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select defaultValue={trip?.status ?? 'planning'} onValueChange={(v) => setValue('status', v as FormValues['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Planificando</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="in_progress">En curso</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Presupuesto */}
          <div className="space-y-1.5">
            <Label>Presupuesto total ({currencySymbol(trip?.default_currency ?? profile?.default_currency ?? undefined)})</Label>
            <Input type="number" step="0.01" {...register('budget_total')} placeholder="0.00" />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Etiquetas</Label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-input min-h-[42px]" style={{ background: 'var(--secondary)' }}>
              {tags.map(tag => (
                <Badge key={tag} className="gap-1" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
                  {tag}
                  <button type="button" onClick={() => setTags(t => t.filter(x => x !== tag))}>
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                placeholder="Añadir etiqueta..."
                className="bg-transparent text-sm flex-1 min-w-[100px] outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">Pulsa Enter o coma para añadir</p>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting || uploading}
              variant="brand">
              {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {trip ? 'Guardar cambios' : 'Crear viaje'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
