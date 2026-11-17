import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Field, Input, Select } from '@/design'
import { useCurrencyCodes, useExchangeRates } from '@/lib/queries/rates'
import { CURRENCIES, cn, currencyName } from '@/lib/utils'

interface CurrencySelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
  /** Los pone <Field> al envolverlo; también se pueden pasar a mano. */
  id?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Desplegable de divisa: las más usadas primero y después todas (~160, de la API
 * de tipos de cambio). Es nativo: en el móvil abre la rueda del sistema y en el
 * ordenador basta con teclear el código (EUR, JPY…) para saltar a él.
 */
export function CurrencySelect({ value, onChange, className, ...rest }: CurrencySelectProps) {
  const codes = useCurrencyCodes()
  const common = codes.filter(c => CURRENCIES.includes(c))
  const others = codes.filter(c => !CURRENCIES.includes(c))
  // El valor actual tiene que estar en la lista aunque la API aún no haya cargado.
  const missing = value && !codes.includes(value) ? value : null
  const option = (c: string) => <option key={c} value={c}>{c} · {currencyName(c)}</option>

  return (
    <Select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
      aria-label={rest.id ? undefined : 'Divisa'}
      {...rest}
    >
      {!value && <option value="">Elige una divisa</option>}
      {missing && option(missing)}
      <optgroup label="Más usadas">{common.map(option)}</optgroup>
      {others.length > 0 && <optgroup label="Todas">{others.map(option)}</optgroup>}
    </Select>
  )
}

const STALE_MS = 1000 * 60 * 60 * 12

/**
 * Conversor de bolsillo («¿cuánto son 50 THB?»). Funciona sin conexión con el
 * último tipo de cambio guardado y avisa si el dato es viejo.
 */
export function CurrencyConverter({ defaultFrom, defaultTo, className }: {
  defaultFrom: string
  defaultTo: string
  className?: string
}) {
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo === defaultFrom ? (defaultFrom === 'EUR' ? 'USD' : 'EUR') : defaultTo)
  const { data: rates, dataUpdatedAt } = useExchangeRates(from)
  // La hora se toma una vez, al abrir el conversor: basta para saber si el cambio es viejo.
  const [openedAt] = useState(() => Date.now())

  const parsed = Number(amount.replace(',', '.'))
  const rate = rates?.[to]
  const result = Number.isFinite(parsed) && parsed > 0 && rate ? parsed * rate : null
  const stale = !!rates && !!dataUpdatedAt && openedAt - dataUpdatedAt > STALE_MS

  return (
    <div className={cn('space-y-4', className)}>
      <Field label="Importe">
        <Input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="text-base tabular-nums"
        />
      </Field>

      <div className="space-y-3">
        <Field label="De"><CurrencySelect value={from} onChange={setFrom} /></Field>
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => { setFrom(to); setTo(from) }}>
            <ArrowLeftRight aria-hidden="true" /> Invertir
          </Button>
        </div>
        <Field label="A"><CurrencySelect value={to} onChange={setTo} /></Field>
      </div>

      <div className="rounded-2xl bg-sunken px-5 py-6 text-center" aria-live="polite">
        {result != null ? (
          <>
            <p className="eyebrow">Son</p>
            <p className="title-hero mt-1 tabular-nums">
              {new Intl.NumberFormat('es', { style: 'currency', currency: to }).format(result)}
            </p>
            {rate && (
              <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                1 {from} = {new Intl.NumberFormat('es', { maximumFractionDigits: 4 }).format(rate)} {to}
              </p>
            )}
          </>
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">
            {!rates
              ? 'Aún no hay tipo de cambio guardado. Conéctate una vez para descargarlo.'
              : !rate
                ? `No hay tipo de cambio para ${to}.`
                : 'Escribe un importe para ver cuánto es.'}
          </p>
        )}
      </div>

      {stale && (
        <p className="text-center text-xs text-muted-foreground">
          Tipo de cambio de hace {formatDistanceToNow(dataUpdatedAt, { locale: es })}.
        </p>
      )}
    </div>
  )
}
