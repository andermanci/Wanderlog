import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, Chip, Input } from '@/design'
import { EXPENSE_CATEGORIES } from '@/lib/utils'

interface QuickExpenseProps {
  /** Divisa en la que se apunta (la del viaje). */
  currency: string
  saving: boolean
  onAdd: (values: { amount: number; description: string; category: string }) => void
}

/** Apuntar un gasto en dos toques: importe y concepto. Fecha de hoy, divisa del viaje. */
export function QuickExpense({ currency, saving, onAdd }: QuickExpenseProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Comida')

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    onAdd({ amount: value, description: description.trim() || category, category })
    setAmount('')
    setDescription('')
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="title-card">Añadir gasto</h2>
          <p className="text-sm text-muted-foreground">Hoy, en {currency}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            aria-label={`Importe en ${currency}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-28 text-base font-semibold tabular-nums"
          />
          <Input
            placeholder="¿En qué?"
            aria-label="Concepto"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="min-w-40 flex-1"
          />
          <Button type="submit" variant="soft" loading={saving} disabled={!amount.trim()} className="w-full sm:w-auto">
            {!saving && <Plus aria-hidden="true" />} Añadir
          </Button>
        </div>
        <div role="group" aria-label="Categoría" className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          {EXPENSE_CATEGORIES.map(cat => (
            <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>{cat}</Chip>
          ))}
        </div>
      </form>
    </Card>
  )
}
