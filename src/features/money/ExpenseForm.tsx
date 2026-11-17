import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Field, Input, Panel, Select } from '@/design'
import { useCreateExpense, useUpdateExpense, type PendingExpense } from '@/lib/queries/expenses'
import { EXPENSE_CATEGORIES } from '@/lib/utils'
import type { Traveler } from '@/types/database'
import { CurrencySelect } from './Currency'
import { today } from './categories'

interface ExpenseFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  /** Gasto que se corrige; sin él, el panel crea uno nuevo. */
  editing: PendingExpense | null
  travelers: Traveler[]
  /** Divisa propuesta para un gasto nuevo (la del viaje). */
  defaultCurrency: string
}

const FORM_ID = 'formulario-gasto'

/**
 * Panel de gasto completo (nuevo o editar). El padre lo remonta con `key` cada
 * vez que lo abre, así que el estado inicial sale siempre de las props.
 */
export function ExpenseForm({ open, onOpenChange, tripId, editing, travelers, defaultCurrency }: ExpenseFormProps) {
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()

  const [description, setDescription] = useState(editing?.description ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace('.', ',') : '')
  const [currency, setCurrency] = useState(editing?.currency ?? defaultCurrency)
  const [category, setCategory] = useState(editing?.category ?? 'Otros')
  const [date, setDate] = useState(editing?.date ?? today())
  // null = «no lo he tocado»: se usa el valor por defecto. Así, si los viajeros
  // llegan después de abrir el panel, el gasto nuevo no se queda sin reparto.
  const [payerChoice, setPayerChoice] = useState<string | null>(null)
  const [splitChoice, setSplitChoice] = useState<string[] | null>(null)
  const [tried, setTried] = useState(false)

  const canSplit = travelers.length >= 2
  const payer = payerChoice
    ?? (editing ? editing.paid_by ?? '' : travelers.find(t => t.is_self)?.id ?? travelers[0]?.id ?? '')
  const split = splitChoice
    ?? (editing ? editing.split_between ?? [] : travelers.map(t => t.id))

  const amountValue = Number(amount.replace(',', '.'))
  const errors = {
    description: description.trim() ? undefined : 'Escribe en qué fue el gasto.',
    amount: Number.isFinite(amountValue) && amountValue > 0 ? undefined : 'Pon un importe mayor que 0.',
    date: date ? undefined : 'Elige la fecha.',
  }
  const saving = createExpense.isPending || updateExpense.isPending

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (errors.description || errors.amount || errors.date) return
    const values = { description: description.trim(), category, amount: amountValue, currency, date }
    try {
      if (editing) {
        await updateExpense.mutateAsync({
          id: editing.id, ...values,
          paid_by: canSplit ? (payer || null) : editing.paid_by,
          split_between: canSplit ? split : editing.split_between,
        })
      } else {
        await createExpense.mutateAsync({
          ...values, trip_id: tripId,
          paid_by: canSplit ? (payer || null) : null,
          split_between: canSplit ? split : [],
        })
      }
      onOpenChange(false)
    } catch {
      // El aviso de error ya lo muestra la mutación; el panel se queda abierto.
    }
  }

  const who = (t: Traveler) => `${t.name}${t.is_self ? ' (yo)' : ''}`

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Editar gasto' : 'Nuevo gasto'}
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {editing ? 'Guardar cambios' : 'Añadir gasto'}
          </Button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-4">
        <Field label="Descripción" error={tried ? errors.description : undefined}>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Por ejemplo: cena en el puerto" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe" error={tried ? errors.amount : undefined}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0,00"
              className="tabular-nums"
            />
          </Field>
          <Field label="Divisa">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            <Select value={category} onChange={e => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Fecha" error={tried ? errors.date : undefined}>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        {canSplit ? (
          <div className="space-y-4 rounded-2xl bg-sunken p-4">
            <Field label="¿Quién pagó?">
              <Select value={payer} onChange={e => setPayerChoice(e.target.value)}>
                <option value="">Sin indicar</option>
                {travelers.map(t => <option key={t.id} value={t.id}>{who(t)}</option>)}
              </Select>
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">¿Entre quién se reparte?</legend>
              <div className="grid gap-x-3 sm:grid-cols-2">
                {travelers.map(t => {
                  const id = `reparto-${t.id}`
                  return (
                    <div key={t.id} className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        id={id}
                        checked={split.includes(t.id)}
                        onCheckedChange={on => setSplitChoice(on ? [...split, t.id] : split.filter(x => x !== t.id))}
                      />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate text-[0.9375rem]">{who(t)}</label>
                    </div>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Se divide a partes iguales entre los marcados. Si es un gasto solo tuyo, no marques a nadie.
              </p>
            </fieldset>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Para repartir gastos hacen falta al menos dos viajeros. Se añaden en Cartera.
          </p>
        )}
      </form>
    </Panel>
  )
}
