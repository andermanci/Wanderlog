import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,box-shadow,transform,filter] duration-150 active:scale-[0.97] ' +
  'disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-[1.125em]',
  {
    variants: {
      variant: {
        /** La acción principal de la pantalla. Una por vista. */
        primary: 'bg-primary text-primary-foreground shadow-card hover:brightness-110',
        /** Acciones secundarias con peso. */
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
        /** Acciones secundarias sobre tarjeta. */
        outline: 'border border-border-strong bg-card text-foreground hover:bg-secondary',
        /** Acciones terciarias y de barra. */
        ghost: 'text-foreground hover:bg-secondary',
        /** Acento suave: «Añadir…» dentro de una lista. */
        soft: 'bg-primary-soft text-accent-foreground hover:brightness-95 dark:hover:brightness-125',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-110',
        'danger-ghost': 'text-destructive hover:bg-destructive/10',
        /** Encima de una foto. */
        photo: 'on-photo hover:brightness-125',
        link: 'text-accent-foreground underline-offset-4 hover:underline rounded-sm px-0! h-auto!',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-[0.9375rem]',
        lg: 'h-13 px-7 text-base',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean
  /** Muestra un indicador y bloquea el botón mientras se guarda. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(button({ variant, size, block }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

const iconButton = cva(
  'inline-grid place-items-center rounded-full shrink-0 select-none transition-[background-color,transform,filter] duration-150 ' +
  'active:scale-[0.94] disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        ghost: 'text-foreground hover:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline: 'border border-border-strong bg-card hover:bg-secondary',
        primary: 'bg-primary text-primary-foreground shadow-card hover:brightness-110',
        'danger-ghost': 'text-destructive hover:bg-destructive/10',
        photo: 'on-photo hover:brightness-125',
      },
      size: {
        sm: 'size-9 [&_svg]:size-4',
        md: 'size-11 [&_svg]:size-5',
        lg: 'size-14 [&_svg]:size-6',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, VariantProps<typeof iconButton> {
  /** Obligatorio: es lo que lee un lector de pantalla y lo que sale al pasar el ratón. */
  label: string
  children: ReactNode
  asChild?: boolean
}

/** Botón de solo icono. Úsalo solo cuando el icono sea inequívoco (cerrar, atrás, menú…). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, children, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        aria-label={label}
        title={label}
        className={cn(iconButton({ variant, size }), className)}
        {...props}
      >
        {children}
      </Comp>
    )
  },
)
IconButton.displayName = 'IconButton'
