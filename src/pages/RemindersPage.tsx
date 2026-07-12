import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Bell, Plus, Trash2, Loader2, BellOff, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useReminders, useCreateReminder, useDeleteReminder } from '@/lib/queries/reminders'
import { useTrip } from '@/lib/queries/trips'
import { useDocuments } from '@/lib/queries/documents'
import { TripHeader } from '@/components/trips/TripHeader'
import { useAuthStore } from '@/store/authStore'
import type { Reminder } from '@/types/database'
import { format, parseISO, isPast } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

const REMINDER_TYPE_LABELS: Record<string, string> = {
  trip_countdown: 'Cuenta atrás del viaje',
  flight: 'Vuelo',
  checkin: 'Check-in',
  document_expiry: 'Vencimiento documento',
  custom: 'Personalizado',
}

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio'),
  remind_at: z.string().min(1, 'Fecha obligatoria'),
  type: z.enum(['trip_countdown', 'flight', 'checkin', 'document_expiry', 'custom']),
})

type FormValues = z.infer<typeof schema>

export function RemindersPage() {
  const { tripId } = useParams<{ tripId: string }>()
  useAuthStore()
  const { data: reminders, isLoading } = useReminders(tripId!)
  const { data: trip } = useTrip(tripId!)
  const { data: documents } = useDocuments(tripId!)
  const createReminder = useCreateReminder()
  const deleteReminder = useDeleteReminder()

  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  async function requestNotifPermission() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
    if (perm === 'granted') toast.success('Notificaciones activadas')
  }

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { type: 'custom' },
  })

  async function onSubmit(values: FormValues) {
    await createReminder.mutateAsync({
      trip_id: tripId!,
      activity_id: null,
      title: values.title,
      remind_at: new Date(values.remind_at).toISOString(),
      type: values.type,
    })
    setFormOpen(false)
    reset()
  }

  const pending = reminders?.filter(r => !isPast(parseISO(r.remind_at))) ?? []
  const past = reminders?.filter(r => isPast(parseISO(r.remind_at))) ?? []

  // Avisos sugeridos: cuenta atrás del viaje + check-in de vuelos.
  const existingTitles = new Set((reminders ?? []).map(r => r.title.toLowerCase()))
  const suggestions: { title: string; remind_at: string; type: FormValues['type'] }[] = []
  if (trip) {
    const d = parseISO(trip.start_date)
    d.setDate(d.getDate() - 1)
    d.setHours(9, 0, 0, 0)
    const title = `Tu viaje a ${trip.destination} empieza mañana`
    if (!isPast(d) && !existingTitles.has(title.toLowerCase())) {
      suggestions.push({ title, remind_at: d.toISOString(), type: 'trip_countdown' })
    }
  }
  for (const doc of documents ?? []) {
    if (doc.category === 'flight' && doc.datetime_start) {
      const checkin = new Date(parseISO(doc.datetime_start).getTime() - 24 * 60 * 60 * 1000)
      const title = `Check-in: ${doc.title}`
      if (!isPast(checkin) && !existingTitles.has(title.toLowerCase())) {
        suggestions.push({ title, remind_at: checkin.toISOString(), type: 'checkin' })
      }
    }
  }

  function addSuggestion(s: { title: string; remind_at: string; type: FormValues['type'] }) {
    createReminder.mutate({ trip_id: tripId!, activity_id: null, title: s.title, remind_at: s.remind_at, type: s.type })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Avisos" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-medium">Avisos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Recordatorios y alertas</p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          variant="brand"
          className="gap-2"
        >
          <Plus size={16} />
          Nuevo aviso
        </Button>
      </div>

      {/* Banner notificaciones */}
      {notifPermission !== 'granted' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-xl mb-6"
          style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
        >
          <div className="flex items-center gap-3">
            <Bell size={18} style={{ color: 'var(--primary)' }} />
            <div>
              <p className="text-sm font-medium">Activa las notificaciones</p>
              <p className="text-xs text-muted-foreground">Recibe avisos en el navegador cuando llegue la hora</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={requestNotifPermission}
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            className="text-xs"
          >
            Activar
          </Button>
        </motion.div>
      )}

      {/* Sugeridos */}
      {suggestions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Sparkles size={13} style={{ color: 'var(--primary)' }} /> Sugeridos
          </h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)', border: '1px dashed color-mix(in srgb, var(--primary) 30%, transparent)' }}
              >
                <Bell size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(s.remind_at), "dd 'de' MMMM 'a las' HH:mm", { locale: es })}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-shrink-0"
                  onClick={() => addSuggestion(s)} disabled={createReminder.isPending}>
                  <Plus size={13} /> Añadir
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !reminders?.length && suggestions.length === 0 ? (
        <EmptyState icon={BellOff} title="Sin recordatorios"
          description="Crea avisos para no olvidar nada importante: facturar, salir hacia el aeropuerto, una reserva…" />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">Pendientes</h2>
              <div className="space-y-2">
                {pending.map((r, i) => (
                  <ReminderRow key={r.id} reminder={r} index={i} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">Pasados</h2>
              <div className="space-y-2 opacity-50">
                {past.map((r, i) => (
                  <ReminderRow key={r.id} reminder={r} index={i} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Nuevo recordatorio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={watch('type')} onValueChange={(v) => setValue('type', v as FormValues['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REMINDER_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input {...register('title')} placeholder="Ej: Hacer check-in online" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fecha y hora *</Label>
              <Input type="datetime-local" {...register('remind_at')} />
              {errors.remind_at && <p className="text-xs text-destructive">{errors.remind_at.message}</p>}
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}
                variant="brand">
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar recordatorio?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteTarget?.title}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteReminder.mutate({ id: deleteTarget.id, tripId: tripId! })
                setDeleteTarget(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ReminderRow({ reminder, index, onDelete }: { reminder: Reminder; index: number; onDelete: (r: Reminder) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group flex items-center gap-4 p-4 rounded-xl"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <Bell size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{reminder.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {format(parseISO(reminder.remind_at), "dd 'de' MMMM 'a las' HH:mm", { locale: es })}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="w-7 h-7 opacity-60 hover:opacity-100 text-destructive hover:text-destructive transition-opacity flex-shrink-0"
        onClick={() => onDelete(reminder)}
      >
        <Trash2 size={12} />
      </Button>
    </motion.div>
  )
}
