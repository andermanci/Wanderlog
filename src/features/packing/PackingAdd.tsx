import { useId, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input } from '@/design'

interface PackingAddProps {
  /** Categorías que ya existen, para proponerlas al escribir. */
  categories: string[]
  saving: boolean
  onAdd: (name: string, category: string) => void
}

/** Añadir un elemento a la lista sin salir de ella, en una sola línea: qué es, en qué categoría va y «Añadir». */
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
    <form onSubmit={submit} aria-label="Añadir algo al equipaje" className="flex items-center gap-2">
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        aria-label="¿Qué te llevas?"
        placeholder="¿Qué te llevas?"
        className="min-w-0 flex-1"
      />
      <Input
        value={category}
        onChange={e => setCategory(e.target.value)}
        aria-label="Categoría (opcional; si la dejas vacía va a «General»)"
        placeholder="Categoría"
        list={listId}
        className="w-28 shrink-0 sm:w-48"
      />
      <datalist id={listId}>
        {categories.map(c => <option key={c} value={c} />)}
      </datalist>
      <Button type="submit" variant="soft" loading={saving} disabled={!name.trim()} className="shrink-0">
        {!saving && <Plus aria-hidden="true" className="hidden sm:block" />} Añadir
      </Button>
    </form>
  )
}
