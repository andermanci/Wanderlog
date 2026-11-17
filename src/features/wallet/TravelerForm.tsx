import { useId, useState, type FormEvent } from 'react'
import { Button, Field, Input } from '@/design'
import { useCreateTraveler } from '@/lib/queries/travelers'
import { PanelFooter } from './PanelSlots'

interface TravelerFormProps {
  tripId: string
  onSaved: () => void
  onCancel: () => void
}

export function TravelerForm({ tripId, onSaved, onCancel }: TravelerFormProps) {
  const formId = useId()
  const createTraveler = useCreateTraveler()
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    try {
      await createTraveler.mutateAsync({ trip_id: tripId, name: clean })
      onSaved()
    } catch {
      // El aviso de error ya lo da la consulta.
    }
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <Field label="Nombre" hint="Es la misma lista de personas con la que se reparten los gastos del viaje.">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del viajero" autoFocus autoComplete="off" />
      </Field>
      <PanelFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" form={formId} variant="primary" loading={createTraveler.isPending} disabled={!name.trim()}>
          Añadir viajero
        </Button>
      </PanelFooter>
    </form>
  )
}
