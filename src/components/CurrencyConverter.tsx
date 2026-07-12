import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CurrencySelect } from '@/components/CurrencySelect'
import { useExchangeRates } from '@/lib/queries/rates'
import { cn } from '@/lib/utils'

const STALE_MS = 1000 * 60 * 60 * 12

// Conversor rápido para el bolsillo ("¿cuánto son 50 THB?"). Funciona offline
// con el último tipo de cambio persistido; avisa si el dato es viejo.
export function CurrencyConverter({ defaultFrom, defaultTo, className }: {
  defaultFrom: string
  defaultTo: string
  className?: string
}) {
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo === defaultFrom ? 'EUR' : defaultTo)
  const { data: rates, dataUpdatedAt } = useExchangeRates(from)

  const parsed = Number(amount.replace(',', '.'))
  const rate = rates?.[to]
  const result = Number.isFinite(parsed) && parsed > 0 && rate ? parsed * rate : null
  const stale = !!rates && !!dataUpdatedAt && Date.now() - dataUpdatedAt > STALE_MS

  return (
    <div className={cn('space-y-3', className)}>
      <Input
        inputMode="decimal"
        placeholder="Importe"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Importe a convertir"
      />
      <div className="flex items-center gap-2">
        <CurrencySelect value={from} onChange={setFrom} className="flex-1 min-w-0" />
        <Button size="icon" variant="ghost" className="flex-shrink-0" aria-label="Invertir divisas"
          onClick={() => { setFrom(to); setTo(from) }}>
          <ArrowLeftRight size={15} />
        </Button>
        <CurrencySelect value={to} onChange={setTo} className="flex-1 min-w-0" />
      </div>

      {result != null ? (
        <p className="text-2xl font-serif font-medium text-center py-1">
          {new Intl.NumberFormat('es', { style: 'currency', currency: to }).format(result)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-1">
          {!rates
            ? 'Sin tipo de cambio guardado; conéctate una vez para descargarlo.'
            : !rate
              ? `Sin tipo de cambio para ${to}.`
              : 'Escribe un importe para convertir.'}
        </p>
      )}

      {stale && (
        <p className="text-xs text-muted-foreground text-center">
          Tipo de cambio de hace {formatDistanceToNow(dataUpdatedAt, { locale: es })}
        </p>
      )}
    </div>
  )
}
