import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, Bell, Info, Lightbulb, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react'
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

/** Notas destacadas de un día («madrugar», «llevar efectivo»…), con aviso opcional. */
export function DayAlerts({ tripId, day, alerts, editMode }: { tripId: string; day: ItineraryDay; alerts: DayAlert[]; editMode: boolean }) {
  const { user } = useAuthStore()
  const createAlert = useCreateDayAlert()
  const updateAlert = useUpdateDayAlert()
  const deleteAlert = useDeleteDayAlert()
  // Los avisos del viaje, para rellenar la hora al editar.
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
    void getPushStatus().then(setPushStatus)
    setEditing('new')
  }
  function openEdit(alert: DayAlert) {
    setText(alert.text)
    setLevel(alert.level)
    const linked = alert.reminder_id ? reminders?.find(r => r.id === alert.reminder_id) : undefined
    if (linked) { setMode('custom'); setCustom(format(parseISO(linked.remind_at), "yyyy-MM-dd'T'HH:mm")) }
    else { setMode('none'); setCustom('') }
    void getPushStatus().then(setPushStatus)
    setEditing(alert)
  }

  const pending = createAlert.isPending || updateAlert.isPending
  async function save() {
    if (!text.trim()) return
    const remind_at = computeRemindAt(mode, day.date, custom)
    try {
      if (editing === 'new') {
        await createAlert.mutateAsync({ trip_id: tripId, day_id: day.id, text: text.trim(), level, order_index: alerts.length, remind_at })
      } else if (editing) {
        await updateAlert.mutateAsync({ id: editing.id, trip_id: tripId, text: text.trim(), level, remind_at, currentReminderId: editing.reminder_id })
      }
      setEditing(null)
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
  if (!editMode && alerts.length === 0) return null

  return (
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
                  { label: 'Editar', icon: Pencil, onSelect: () => openEdit(alert) },
                  { label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => setDeleteTarget(alert) },
                ]}
              />
            ) : undefined}
          >
            <p className="whitespace-pre-wrap break-words">{alert.text}</p>
          </Notice>
        )
      })}

      {editMode && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={openNew}>
          <Plus /> Añadir una nota al día
        </Button>
      )}

      <Panel
        open={!!editing} onOpenChange={o => { if (!o) setEditing(null) }}
        title={editing === 'new' ? 'Nota para este día' : 'Editar nota'}
        description="Algo que no quieres que se te pase ese día."
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="primary" loading={pending} disabled={!text.trim()} onClick={save}>{editing === 'new' ? 'Añadir nota' : 'Guardar'}</Button>
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
    </div>
  )
}
