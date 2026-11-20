import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, Bell, Info, Lightbulb, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Chip, Confirm, Field, Input, Menu, Notice, Panel, Textarea, type Tone } from '@/design'
import { useCreateDayAlert, useDeleteDayAlert, useUpdateDayAlert } from '@/lib/queries/dayAlerts'
import { useReminders } from '@/lib/queries/reminders'
import { enablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { useAuthStore } from '@/store/authStore'
import type { DayAlert, DayAlertLevel, ItineraryDay } from '@/types/database'

const LEVELS: Record<DayAlertLevel, { label: string; icon: LucideIcon; tone: Tone }> = {
  tip: { label: 'Consejo', icon: Lightbulb, tone: 'warning' },
  info: { label: 'Información', icon: Info, tone: 'info' },
  warning: { label: 'Importante', icon: AlertTriangle, tone: 'danger' },
}

type ScheduleMode = 'none' | 'morning' | 'prev-night' | 'custom'
const SCHEDULES: [ScheduleMode, string][] = [
  ['none', 'No avisar'],
  ['morning', 'Esa mañana (08:00)'],
  ['prev-night', 'La noche anterior (21:00)'],
  ['custom', 'Elegir fecha y hora'],
]

// El instante del aviso a partir del modo elegido y la fecha del día.
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

/**
 * Notas destacadas de un día («madrugar», «llevar efectivo»…), con aviso opcional.
 * El botón de añadir lo pinta el día junto a sus demás acciones: aquí solo llega
 * `adding` para abrir el panel en blanco.
 */
export function DayAlerts({ tripId, day, alerts, editMode, adding, onAddingChange }: {
  tripId: string
  day: ItineraryDay
  alerts: DayAlert[]
  editMode: boolean
  adding: boolean
  onAddingChange: (open: boolean) => void
}) {
  const deleteAlert = useDeleteDayAlert()
  const [editing, setEditing] = useState<DayAlert | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DayAlert | null>(null)

  return (
    <>
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => {
            const cfg = LEVELS[alert.level]
            return (
              <Notice
                key={alert.id} tone={cfg.tone} icon={cfg.icon}
                title={<span className="flex items-center gap-1.5">{cfg.label}{alert.reminder_id && <Bell className="size-3.5" aria-label="Con aviso" />}</span>}
                action={editMode ? (
                  <Menu
                    label="Opciones de la nota"
                    items={[
                      { label: 'Editar', icon: Pencil, onSelect: () => setEditing(alert) },
                      { label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => setDeleteTarget(alert) },
                    ]}
                  />
                ) : undefined}
              >
                <p className="whitespace-pre-wrap break-words">{alert.text}</p>
              </Notice>
            )
          })}
        </div>
      )}

      {/* Se monta al abrirse: así arranca siempre con los datos de la nota (o en blanco). */}
      {(adding || editing) && (
        <NotePanel
          key={editing?.id ?? 'new'} tripId={tripId} day={day} alert={editing} count={alerts.length}
          onClose={() => { setEditing(null); onAddingChange(false) }}
        />
      )}

      <Confirm
        open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }} danger
        title="¿Eliminar esta nota?"
        description={deleteTarget?.reminder_id ? 'Se borrará la nota y también su aviso.' : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleteTarget) deleteAlert.mutate({ id: deleteTarget.id, tripId, reminderId: deleteTarget.reminder_id })
          setDeleteTarget(null)
        }}
      />
    </>
  )
}

/** Crear o editar una nota del día. */
function NotePanel({ tripId, day, alert, count, onClose }: {
  tripId: string
  day: ItineraryDay
  /** La nota que se edita; null al crear. */
  alert: DayAlert | null
  /** Cuántas notas tiene ya el día (la nueva va al final). */
  count: number
  onClose: () => void
}) {
  const { user } = useAuthStore()
  const createAlert = useCreateDayAlert()
  const updateAlert = useUpdateDayAlert()
  // Los avisos del viaje, para rellenar la hora al editar.
  const { data: reminders } = useReminders(tripId)
  const linked = alert?.reminder_id ? reminders?.find(r => r.id === alert.reminder_id) : undefined

  const [text, setText] = useState(alert?.text ?? '')
  const [level, setLevel] = useState<DayAlertLevel>(alert?.level ?? 'tip')
  const [mode, setMode] = useState<ScheduleMode>(linked ? 'custom' : 'none')
  const [custom, setCustom] = useState(linked ? format(parseISO(linked.remind_at), "yyyy-MM-dd'T'HH:mm") : '')
  const [pushStatus, setPushStatus] = useState<PushStatus>('disabled')
  useEffect(() => { void getPushStatus().then(setPushStatus) }, [])

  const pending = createAlert.isPending || updateAlert.isPending
  async function save() {
    if (!text.trim()) return
    const remind_at = computeRemindAt(mode, day.date, custom)
    try {
      if (alert) {
        await updateAlert.mutateAsync({ id: alert.id, trip_id: tripId, text: text.trim(), level, remind_at, currentReminderId: alert.reminder_id })
      } else {
        await createAlert.mutateAsync({ trip_id: tripId, day_id: day.id, text: text.trim(), level, order_index: count, remind_at })
      }
      onClose()
    } catch { /* la mutación ya avisa */ }
  }

  async function activatePush() {
    if (!user) return
    const status = await enablePush(user.id)
    setPushStatus(status)
    if (status === 'enabled') toast.success('Notificaciones activadas')
    else if (status === 'denied') toast.error('Has denegado el permiso de notificaciones')
  }

  const willNotify = mode !== 'none' && (mode !== 'custom' || !!custom)
  const dayName = format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })

  return (
    <Panel
      open onOpenChange={o => { if (!o) onClose() }}
      title={alert ? 'Editar nota' : 'Nota del día'}
      description={`Algo que no quieres que se te pase el ${dayName}.`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={pending} disabled={!text.trim()} onClick={save}>{alert ? 'Guardar' : 'Añadir nota'}</Button>
      </>}
    >
      <div className="space-y-5">
        <Field label="¿Qué hay que recordar?">
          <Textarea value={text} autoFocus placeholder="Madrugar para ver el amanecer desde el mirador" onChange={e => setText(e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Tipo</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de nota">
            {(Object.keys(LEVELS) as DayAlertLevel[]).map(lv => (
              <Chip key={lv} icon={LEVELS[lv].icon} selected={level === lv} onClick={() => setLevel(lv)}>{LEVELS[lv].label}</Chip>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">¿Te avisamos? <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cuándo avisar">
            {SCHEDULES.map(([m, label]) => <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>{label}</Chip>)}
          </div>
          {mode === 'custom' && (
            <Input type="datetime-local" aria-label="Fecha y hora del aviso" value={custom} onChange={e => setCustom(e.target.value)} />
          )}
          {mode !== 'none' && mode !== 'custom' && (
            <p className="text-sm text-muted-foreground">
              Te avisaremos el {format(parseISO(computeRemindAt(mode, day.date, custom)!), "d 'de' MMMM 'a las' HH:mm", { locale: es })}.
            </p>
          )}
          {willNotify && pushStatus !== 'enabled' && (
            <Notice
              tone="warning" icon={Bell}
              action={pushStatus !== 'denied' && pushStatus !== 'unsupported'
                ? <Button size="sm" variant="primary" onClick={activatePush}>Activar</Button>
                : undefined}
            >
              {pushStatus === 'denied'
                ? 'Tienes las notificaciones bloqueadas en este navegador: el aviso no te llegará.'
                : pushStatus === 'unsupported'
                  ? 'Este navegador no admite notificaciones: el aviso no te llegará aquí.'
                  : 'Activa las notificaciones para recibir este aviso.'}
            </Notice>
          )}
        </div>
      </div>
    </Panel>
  )
}
