import { useState, type FormEvent } from 'react'
import { isPast } from 'date-fns'
import { Button, Field, Input, Panel, Select } from '@/design'
import { useCreateReminder } from '@/lib/queries/reminders'
import { REMINDER_TYPES, type ReminderType } from './reminderTypes'

interface ReminderFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
}

const FORM_ID = 'formulario-aviso'

/** Panel «Nuevo aviso». El padre lo remonta con `key` en cada apertura para que salga vacío. */
export function ReminderForm({ open, onOpenChange, tripId }: ReminderFormProps) {
  const createReminder = useCreateReminder()
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [type, setType] = useState<ReminderType>('custom')
  const [tried, setTried] = useState(false)

  const errors = {
    title: title.trim() ? undefined : 'Escribe de qué quieres que te avisemos.',
    when: when ? undefined : 'Elige el día y la hora.',
  }
  const inPast = !!when && isPast(new Date(when))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (errors.title || errors.when) return
    try {
      await createReminder.mutateAsync({
        trip_id: tripId,
        activity_id: null,
        title: title.trim(),
        remind_at: new Date(when).toISOString(),
        type,
      })
      onOpenChange(false)
    } catch {
      // El error ya se avisa desde la mutación; el panel sigue abierto.
    }
  }

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo aviso"
      description="Te llegará una notificación a la hora que elijas."
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={createReminder.isPending}>Crear aviso</Button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-4">
        <Field label="¿De qué te avisamos?" error={tried ? errors.title : undefined}>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Por ejemplo: hacer el check-in del vuelo" />
        </Field>
        <Field
          label="¿Cuándo?"
          error={tried ? errors.when : undefined}
          hint={inPast ? 'Esa hora ya ha pasado: el aviso irá directo a «Pasados».' : undefined}
        >
          <Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
        </Field>
        <Field label="Tipo" hint="Solo sirve para distinguirlos en la lista.">
          <Select value={type} onChange={e => setType(e.target.value as ReminderType)}>
            {Object.entries(REMINDER_TYPES).map(([value, t]) => <option key={value} value={value}>{t.label}</option>)}
          </Select>
        </Field>
      </form>
    </Panel>
  )
}
