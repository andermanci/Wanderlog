import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Limita las fechas seleccionables (inclusive). */
  fromDate?: Date
  toDate?: Date
}

export function DatePicker({ value, onChange, placeholder = 'Seleccionar fecha', className, disabled, fromDate, toDate }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined

  const disabledMatchers = [
    ...(fromDate ? [{ before: fromDate }] : []),
    ...(toDate ? [{ after: toDate }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start text-left font-normal', !selected && 'text-muted-foreground', className)}
        >
          <CalendarIcon size={14} className="mr-2 opacity-60" />
          {selected ? format(selected, 'dd MMM yyyy', { locale: es }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? fromDate}
          startMonth={fromDate}
          endMonth={toDate}
          disabled={disabledMatchers.length ? disabledMatchers : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, 'yyyy-MM-dd') : '')
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
