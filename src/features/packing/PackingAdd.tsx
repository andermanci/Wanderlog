import { useId, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, Field, Input } from '@/design'

interface PackingAddProps {
  /** Categorías que ya existen, para proponerlas al escribir. */
  categories: string[]
  saving: boolean
  onAdd: (name: string, category: string) => void
}

/** Añadir un elemento a la lista sin salir de ella: qué es y en qué categoría va. */
export function PackingAdd({ categories, saving, onAdd }: PackingAddProps) {
  const listId = useId()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), category.trim() || 'General')
    setName('')
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="¿Qué te llevas?">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Por ejemplo: cargador del móvil" />
        </Field>
        <Field label="Categoría" optional>
          <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="General" list={listId} />
        </Field>
        <datalist id={listId}>
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <Button type="submit" variant="soft" loading={saving} disabled={!name.trim()}>
          {!saving && <Plus aria-hidden="true" />} Añadir
        </Button>
      </form>
    </Card>
  )
}
