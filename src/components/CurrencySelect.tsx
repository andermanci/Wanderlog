import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { useCurrencyCodes } from '@/lib/queries/rates'
import { currencyName, cn } from '@/lib/utils'

interface CurrencySelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

// Selector de divisa con buscador: lista completa (~160) desde la API de tipos de
// cambio; se filtra por código o por nombre localizado.
export function CurrencySelect({ value, onChange, className }: CurrencySelectProps) {
  const codes = useCurrencyCodes()
  // Garantiza que el valor actual esté en la lista aunque la API aún no cargue.
  const list = value && !codes.includes(value) ? [value, ...codes] : codes
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className="truncate">{value ? `${value} · ${currencyName(value)}` : 'Selecciona divisa'}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" style={{ width: 'var(--radix-popover-trigger-width)' }} align="start">
        <Command>
          <CommandInput placeholder="Buscar divisa…" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {list.map(c => (
                <CommandItem
                  key={c}
                  value={`${c} ${currencyName(c)}`}
                  onSelect={() => { onChange(c); setOpen(false) }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === c ? 'opacity-100' : 'opacity-0')} />
                  {c} · {currencyName(c)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
