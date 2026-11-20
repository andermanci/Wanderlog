import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, Chip } from '@/design'
import { EXPENSE_CATEGORIES } from '@/lib/utils'
import { categoryLook } from './categories'

interface QuickExpenseProps {
  /** Divisa en la que se apunta (la del viaje). */
  currency: string
  saving: boolean
  onAdd: (values: { amount: number; description: string; category: string }) => void
}

// Los campos van «desnudos» dentro de la barra: el borde y el foco los pinta la barra entera.
const bare = 'min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60'

/**
 * Apuntar un gasto en dos toques, como en una calculadora: el importe en grande,
 * en qué fue y su categoría. Fecha de hoy, divisa del viaje.
 */
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
    <form
      onSubmit={submit}
      aria-label="Añadir un gasto de hoy"
      data-tone={categoryLook(category).tone}
      className="overflow-hidden rounded-2xl border border-border-strong bg-card shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-4 pr-2.5">
        <label className="flex min-w-0 items-baseline gap-1.5">
          <input
            inputMode="decimal"
            placeholder="0,00"
            aria-label={`Importe en ${currency}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={`${bare} h-12 w-28 font-serif text-3xl font-medium tracking-tight tabular-nums`}
          />
          <span className="eyebrow">{currency}</span>
        </label>
        <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
        <input
          placeholder="¿En qué? (hoy)"
          aria-label="Concepto"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={`${bare} order-last h-11 basis-full border-t border-border text-base sm:order-none sm:h-12 sm:flex-1 sm:basis-32 sm:border-t-0`}
        />
        {/* En móvil el botón sube junto al importe y el concepto ocupa su propia línea: nada queda cortado. */}
        <Button type="submit" variant="soft" loading={saving} disabled={!amount.trim()} className="ml-auto sm:ml-0">
          {!saving && <Plus aria-hidden="true" />} Añadir
        </Button>
      </div>
      <div role="group" aria-label="Categoría" className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border bg-sunken px-3 py-2.5">
        {EXPENSE_CATEGORIES.map(cat => (
          <Chip key={cat} icon={categoryLook(cat).icon} selected={category === cat} onClick={() => setCategory(cat)}>{cat}</Chip>
        ))}
      </div>
    </form>
  )
}
