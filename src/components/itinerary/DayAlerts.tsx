import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Info, AlertTriangle, Bell, Plus, Pencil, Trash2, Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCreateDayAlert, useUpdateDayAlert, useDeleteDayAlert } from '@/lib/queries/dayAlerts'
import { useReminders } from '@/lib/queries/reminders'
import { enablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { useAuthStore } from '@/store/authStore'
import type { DayAlert, DayAlertLevel, ItineraryDay } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

// Niveles de alerta: icono + color que definen su aspecto destacado.
const LEVELS: Record<DayAlertLevel, { label: string; icon: LucideIcon; color: string }> = {
  tip: { label: 'Consejo', icon: Lightbulb, color: '#d97706' },
  info: { label: 'Info', icon: Info, color: '#2563eb' },
  warning: { label: 'Importante', icon: AlertTriangle, color: '#ea580c' },
}

type ScheduleMode = 'none' | 'morning' | 'prev-night' | 'custom'

// Calcula el instante del aviso a partir del modo elegido y la fecha del día.
function computeRemindAt(mode: ScheduleMode, dayDate: string, custom: string): string | null {
  if (mode === 'morning') return new Date(`${dayDate}T08:00:00`).toISOString()
  if (mode === 'prev-night') {
    const d = new Date(`${dayDate}T21:00:00`)
    d.setDate(d.getDate() - 1)
    return d.toISOString()
  }
  if (mode === 'custom') return custom ? new Date(custom).toISOString() : null
  return null
}

export function DayAlerts({ tripId, day, alerts }: { tripId: string; day: ItineraryDay; alerts: DayAlert[] }) {
  const { user } = useAuthStore()
  const createAlert = useCreateDayAlert()
  const updateAlert = useUpdateDayAlert()
  const deleteAlert = useDeleteDayAlert()
  // Reutilizamos los reminders del viaje para prerrellenar la hora al editar.
  const { data: reminders } = useReminders(tripId)

  const [editing, setEditing] = useState<DayAlert | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DayAlert | null>(null)

  const [text, setText] = useState('')
  const [level, setLevel] = useState<DayAlertLevel>('tip')
  const [mode, setMode] = useState<ScheduleMode>('none')
  const [custom, setCustom] = useState('')
  const [pushStatus, setPushStatus] = useState<PushStatus>('disabled')

  function openNew() {
    setText(''); setLevel('tip'); setMode('none'); setCustom('')
    getPushStatus().then(setPushStatus)
    setEditing('new')
  }

  function openEdit(alert: DayAlert) {
    setText(alert.text)
    setLevel(alert.level)
    const linked = alert.reminder_id ? reminders?.find(r => r.id === alert.reminder_id) : undefined
    if (linked) {
      setMode('custom')
      setCustom(format(parseISO(linked.remind_at), "yyyy-MM-dd'T'HH:mm"))
    } else {
      setMode('none'); setCustom('')
    }
    getPushStatus().then(setPushStatus)
    setEditing(alert)
  }

  const isPending = createAlert.isPending || updateAlert.isPending

  async function save() {
    if (!text.trim()) return
    const remind_at = computeRemindAt(mode, day.date, custom)
    if (editing === 'new') {
      await createAlert.mutateAsync({
        trip_id: tripId, day_id: day.id, text: text.trim(), level, order_index: alerts.length, remind_at,
      })
    } else if (editing) {
      await updateAlert.mutateAsync({
        id: editing.id, trip_id: tripId, text: text.trim(), level, remind_at, currentReminderId: editing.reminder_id,
      })
    }
    setEditing(null)
  }

  async function activatePush() {
    if (!user) return
    const status = await enablePush(user.id)
    setPushStatus(status)
    if (status === 'enabled') toast.success('Notificaciones activadas')
    else if (status === 'denied') toast.error('Permiso de notificaciones denegado')
  }

  const willNotify = mode !== 'none' && (mode !== 'custom' || !!custom)

  return (
    <div className="mb-3 sm:ml-[52px] space-y-2">
      <AnimatePresence initial={false}>
        {alerts.map(alert => {
          const cfg = LEVELS[alert.level]
          const Icon = cfg.icon
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="group flex items-start gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: `color-mix(in srgb, ${cfg.color} 7%, var(--card))`,
                border: `1px solid color-mix(in srgb, ${cfg.color} 22%, transparent)`,
              }}
            >
              <div
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${cfg.color} 16%, transparent)`, color: cfg.color }}
              >
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                  {alert.reminder_id && (
                    <Bell size={11} style={{ color: cfg.color }} aria-label="Con notificación" />
                  )}
                </div>
                <p className="text-sm font-medium leading-snug whitespace-pre-wrap break-words mt-0.5">
                  {alert.text}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="w-6 h-6" aria-label="Editar alerta"
                  onClick={() => openEdit(alert)}>
                  <Pencil size={12} />
                </Button>
                <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" aria-label="Eliminar alerta"
                  onClick={() => setDeleteTarget(alert)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      <button
        onClick={openNew}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        <Plus size={12} />
        Añadir alerta del día
      </button>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {editing === 'new' ? 'Nueva alerta del día' : 'Editar alerta'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Texto *</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ej: Recomendado madrugar para aprovechar el día!"
                className="min-h-[70px]"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(Object.keys(LEVELS) as DayAlertLevel[]).map(lv => {
                  const cfg = LEVELS[lv]
                  const Icon = cfg.icon
                  const active = level === lv
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLevel(lv)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: active ? `color-mix(in srgb, ${cfg.color} 15%, transparent)` : 'var(--secondary)',
                        border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
                        color: active ? cfg.color : 'var(--muted-foreground)',
                      }}
                    >
                      <Icon size={14} />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Bell size={13} /> Avisarme (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['none', 'Sin aviso'],
                  ['morning', 'La mañana de ese día (08:00)'],
                  ['prev-night', 'La noche anterior (21:00)'],
                  ['custom', 'Fecha y hora exacta'],
                ] as [ScheduleMode, string][]).map(([m, label]) => {
                  const active = mode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: active ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--secondary)',
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {mode === 'custom' && (
                <Input
                  type="datetime-local"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="mt-2"
                />
              )}
              {mode !== 'none' && mode !== 'custom' && (
                <p className="text-xs text-muted-foreground">
                  Avisará el {format(parseISO(computeRemindAt(mode, day.date, custom)!), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
              )}
              {willNotify && pushStatus !== 'enabled' && (
                <div
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg mt-1"
                  style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
                >
                  <p className="text-xs text-muted-foreground">
                    {pushStatus === 'denied'
                      ? 'Has bloqueado las notificaciones en el navegador.'
                      : 'Activa las notificaciones para recibir este aviso.'}
                  </p>
                  {pushStatus !== 'denied' && pushStatus !== 'unsupported' && (
                    <Button size="sm" type="button" className="text-xs h-7 flex-shrink-0"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                      onClick={activatePush}>
                      Activar
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" disabled={isPending || !text.trim()} onClick={save}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              {isPending && <Loader2 size={14} className="animate-spin mr-2" />}
              {editing === 'new' ? 'Añadir' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar alerta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la alerta{deleteTarget?.reminder_id ? ' y su notificación' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteAlert.mutate({ id: deleteTarget.id, tripId, reminderId: deleteTarget.reminder_id })
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
