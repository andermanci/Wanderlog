import {
  forwardRef, useId, cloneElement, isValidElement,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const control =
  'w-full rounded-md border border-input bg-card px-3.5 text-[0.9375rem] text-foreground placeholder:text-muted-foreground/70 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-border-strong ' +
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(control, 'h-11', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(control, 'py-2.5 leading-relaxed resize-y min-h-20', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

/** Desplegable nativo: en el móvil abre la rueda del sistema, que todo el mundo conoce. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className="relative block">
      <select ref={ref} className={cn(control, 'h-11 appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
    </span>
  ),
)
Select.displayName = 'Select'

interface FieldProps {
  label: ReactNode
  /** Texto de ayuda bajo el campo. */
  hint?: ReactNode
  /** Mensaje de error; sustituye a la ayuda y marca el campo. */
  error?: ReactNode
  /** Añade «(opcional)» al rótulo. */
  optional?: boolean
  className?: string
  /** Un único control (Input, Textarea, Select…). Recibe id y aria-* solo. */
  children: ReactElement
}

/** Rótulo + control + ayuda/error, enlazados para lectores de pantalla. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const auto = useId()
  const childProps = isValidElement(children) ? (children.props as Record<string, unknown>) : {}
  const id = (childProps.id as string | undefined) ?? auto
  const noteId = `${id}-nota`
  const note = error ?? hint
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">(opcional)</span>}
      </label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': note ? noteId : undefined,
      })}
      {note && (
        <p id={noteId} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </p>
      )}
    </div>
  )
}

interface CheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
  /** Redondo, para marcar cosas como hechas. */
  round?: boolean
}

export function Checkbox({ checked, onCheckedChange, round, className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={v => onCheckedChange(v === true)}
      className={cn(
        'size-6 shrink-0 grid place-items-center border-2 border-border-strong bg-card transition-colors duration-150',
        'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
        'disabled:opacity-50',
        round ? 'rounded-full' : 'rounded-[0.4rem]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function Switch(props: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong transition-colors duration-200 data-[state=checked]:bg-primary disabled:opacity-50"
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5.5 translate-x-0.75 rounded-full bg-white shadow-card transition-transform duration-200 data-[state=checked]:translate-x-5.75" />
    </SwitchPrimitive.Root>
  )
}

/** Fila «texto a la izquierda, interruptor a la derecha» para ajustes. */
export function SwitchRow({ label, description, ...props }: SwitchProps & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-[0.9375rem] font-medium">{label}</span>
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} {...props} />
    </div>
  )
}
