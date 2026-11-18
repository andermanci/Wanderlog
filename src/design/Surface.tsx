import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Los tonos definidos en tokens.css ([data-tone]). */
export type Tone =
  | 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  | 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'place' | 'other'
  | 'attraction' | 'cafe' | 'bar' | 'shop'
  | 'planning' | 'confirmed' | 'in_progress' | 'completed'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
  /** Se puede pulsar entera: gana sombra y cursor. */
  interactive?: boolean
  /** Relleno interior. */
  pad?: 'none' | 'sm' | 'md' | 'lg'
  /** Fondo hundido en vez de tarjeta elevada (grupos dentro de una tarjeta). */
  sunken?: boolean
}

/** La superficie estándar. Todo bloque de contenido va en una. */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ asChild, interactive, pad = 'md', sunken, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'
    return (
      <Comp
        ref={ref}
        className={cn(
          'rounded-2xl text-card-foreground',
          sunken ? 'bg-sunken' : 'bg-card border border-border shadow-card',
          pad === 'sm' && 'p-3.5',
          pad === 'md' && 'p-5',
          pad === 'lg' && 'p-6 md:p-7',
          interactive && 'block w-full text-left cursor-pointer transition-[box-shadow,transform,border-color] duration-200 hover:shadow-raised hover:border-border-strong active:scale-[0.99]',
          className,
        )}
        {...props}
      />
    )
  },
)
Card.displayName = 'Card'

interface SectionProps {
  title: ReactNode
  /** Frase corta bajo el título. */
  description?: ReactNode
  /** Botón o enlace a la derecha del título. */
  action?: ReactNode
  className?: string
  children: ReactNode
}

/** Un grupo con título dentro de una página. */
export function Section({ title, description, action, className, children }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {/* Título y acción en la misma línea; la descripción debajo, a todo el ancho:
          en móvil, al lado de un botón quedaba partida en una columna estrecha. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="title-section min-w-0">{title}</h2>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

interface RowProps {
  /** Icono en un círculo con el tono de la fila. */
  icon?: LucideIcon
  /** En vez de icono: una miniatura, un avatar, un emoji… */
  leading?: ReactNode
  tone?: Tone
  title: ReactNode
  subtitle?: ReactNode
  /** Lo que va a la derecha (un importe, una insignia). Si es interactivo (un menú), pásalo en `after`. */
  trailing?: ReactNode
  /** Controles a la derecha que NO forman parte del área pulsable (menú «⋯», casilla). */
  after?: ReactNode
  /** Pinta la flecha «›» de «esto lleva a otro sitio». */
  chevron?: boolean
  /** La fila es un enlace. */
  to?: string
  /** La fila es un botón. */
  onClick?: () => void
  className?: string
}

/** Fila de lista: icono · título/subtítulo · algo a la derecha. Va dentro de <RowList>. */
export function Row({ icon: Icon, leading, tone, title, subtitle, trailing, after, chevron, to, onClick, className }: RowProps) {
  const content = (
    <>
      {leading ?? (Icon && (
        <span data-tone={tone ?? 'primary'} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ))}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium text-foreground">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 flex items-center gap-1 text-sm text-muted-foreground">{trailing}</span>}
      {chevron && <ChevronRight className="size-4.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
    </>
  )
  const main = 'flex min-h-15 min-w-0 flex-1 items-center gap-3.5 px-4 py-3 text-left'
  const hover = 'cursor-pointer transition-colors duration-150 hover:bg-secondary/70'
  return (
    <div className={cn('flex items-center', className)}>
      {to
        ? <Link to={to} className={cn(main, hover)}>{content}</Link>
        : onClick
          ? <button type="button" onClick={onClick} className={cn(main, hover)}>{content}</button>
          : <div className={main}>{content}</div>}
      {after && <div className="shrink-0 pr-2.5 flex items-center gap-1">{after}</div>}
    </div>
  )
}

/** Contenedor de <Row>: tarjeta con separadores finos entre filas. */
export function RowList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card pad="none" className={cn('overflow-hidden divide-y divide-border', className)}>
      {children}
    </Card>
  )
}

interface BadgeProps {
  tone?: Tone
  /** Fondo sólido en vez de suave. */
  solid?: boolean
  icon?: LucideIcon
  className?: string
  children: ReactNode
}

/** Etiqueta pequeña que informa (estado, tipo, contador). No se pulsa. */
export function Badge({ tone = 'neutral', solid, icon: Icon, className, children }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        solid ? 'bg-tone text-white dark:text-background' : 'bg-tone-soft text-tone',
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  )
}

interface ChipProps {
  selected?: boolean
  onClick?: () => void
  icon?: LucideIcon
  /** Número a la derecha (resultados de ese filtro). */
  count?: number
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** Filtro o elección que se pulsa. Para elegir UNA entre pocas opciones usa <Segmented>. */
export function Chip({ selected, onClick, icon: Icon, count, disabled, className, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap',
        'transition-colors duration-150 active:scale-[0.97] disabled:opacity-50',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border-strong bg-card text-foreground hover:bg-secondary',
        className,
      )}
    >
      {Icon && <Icon className="size-4" aria-hidden="true" />}
      {children}
      {count !== undefined && <span className={cn('text-xs tabular-nums', selected ? 'opacity-70' : 'text-muted-foreground')}>{count}</span>}
    </button>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; icon?: LucideIcon }[]
  /** Nombre del grupo para lectores de pantalla. */
  label: string
  /** Ocupa todo el ancho, repartido a partes iguales. */
  block?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Elegir una de 2–4 vistas u opciones (Lista / Mapa, Días / Ideas). */
export function Segmented<T extends string>({ value, onChange, options, label, block, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex rounded-full bg-secondary p-1', block && 'flex w-full', className)}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
              block && 'flex-1',
              active ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden="true" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface EmptyProps {
  icon: LucideIcon
  title: ReactNode
  /** Qué es esto y qué puede hacer la persona ahora. */
  description?: ReactNode
  /** El botón (o botones) para empezar. */
  children?: ReactNode
  className?: string
  /** Sin tarjeta alrededor (dentro de otra tarjeta o panel). */
  bare?: boolean
}

/** Estado vacío: dice qué falta y ofrece el siguiente paso. */
export function Empty({ icon: Icon, title, description, children, className, bare }: EmptyProps) {
  return (
    <div className={cn(
      'flex flex-col items-center px-6 py-10 text-center',
      !bare && 'rounded-2xl border border-dashed border-border-strong bg-card/50',
      className,
    )}>
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-accent-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 title-section">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-secondary', className)} />
}

export function Spinner({ className, label = 'Cargando' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex">
      <LoaderCircle className={cn('size-5 animate-spin text-primary', className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

interface ProgressProps {
  /** 0–100. */
  value: number
  tone?: Tone
  label?: string
  className?: string
}

export function Progress({ value, tone = 'primary', label, className }: ProgressProps) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}
      data-tone={tone}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
    >
      <div className="h-full rounded-full bg-tone transition-[width] duration-500 ease-out" style={{ width: `${v}%` }} />
    </div>
  )
}

interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = (name ?? '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  return (
    <span className={cn(
      'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-semibold text-accent-foreground',
      size === 'sm' && 'size-8 text-xs',
      size === 'md' && 'size-10 text-sm',
      size === 'lg' && 'size-14 text-lg',
      className,
    )}>
      {src ? <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : initials}
    </span>
  )
}

interface NoticeProps {
  tone?: Tone
  icon?: LucideIcon
  title?: ReactNode
  children?: ReactNode
  /** Botón a la derecha. */
  action?: ReactNode
  className?: string
}

/** Aviso en línea dentro de una página (falta algo, cuidado con esto, hecho). */
export function Notice({ tone = 'info', icon: Icon, title, children, action, className }: NoticeProps) {
  return (
    <div data-tone={tone} className={cn('flex items-start gap-3 rounded-xl border border-tone-line bg-tone-soft px-4 py-3', className)}>
      {Icon && <Icon className="mt-0.5 size-5 shrink-0 text-tone" aria-hidden="true" />}
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
