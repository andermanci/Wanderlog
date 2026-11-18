import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Play, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/design'
import { cn } from '@/lib/utils'

interface TrackRowProps {
  /** A dónde lleva la pista entera. Sin destino, la fila no se pulsa. */
  to?: string
  /** Lista para escuchar: sale el botón redondo de reproducir. */
  ready: boolean
  title: ReactNode
  /** Rótulo pequeño encima del título. */
  eyebrow?: ReactNode
  /** Línea de apoyo bajo el título (día, paradas, duración…). */
  meta?: ReactNode
  /** A la derecha: «Crear», un indicador, la duración… */
  trailing?: ReactNode
  /** Icono del disco cuando aún no se puede reproducir. */
  icon: LucideIcon
  /** Color del icono cuando aún no se puede reproducir. */
  tone?: Tone
  /** Pista destacada (la de la ciudad): más grande y sobre fondo de color. */
  featured?: boolean
  className?: string
}

/**
 * Una audioguía con aspecto de pista de reproducción: disco redondo a la
 * izquierda (reproducir si está lista; hueco punteado si aún hay que crearla),
 * título en serif y sus datos debajo.
 */
export function TrackRow({
  to, ready, title, eyebrow, meta, trailing, icon: Icon, tone = 'neutral', featured, className,
}: TrackRowProps) {
  const cuerpo = (
    <>
      <span
        aria-hidden="true"
        data-tone={ready ? undefined : tone}
        className={cn(
          'grid shrink-0 place-items-center rounded-full transition-transform duration-150',
          featured ? 'size-14' : 'size-11',
          ready
            ? 'bg-primary text-primary-foreground shadow-card ring-4 ring-primary/15 group-hover:scale-105'
            : 'border border-dashed border-border-strong text-tone',
        )}
      >
        {ready
          ? <Play fill="currentColor" className={cn('ml-0.5', featured ? 'size-6' : 'size-4.5')} />
          : <Icon className={featured ? 'size-6' : 'size-5'} />}
      </span>
      <span className="min-w-0 flex-1">
        {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
        <span
          className={cn(
            'block font-serif font-medium tracking-tight text-foreground',
            featured ? 'text-xl leading-tight' : 'text-lg leading-snug',
          )}
        >
          {title}
        </span>
        {meta && <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0 text-sm">{trailing}</span>}
    </>
  )

  const clases = cn(
    'group flex min-h-14 items-center gap-3.5 text-left transition-colors duration-150',
    featured ? 'rounded-2xl bg-primary-soft p-4' : 'rounded-xl px-2 py-2.5',
    to && (featured ? 'hover:brightness-97 dark:hover:brightness-110' : 'hover:bg-secondary/70'),
    className,
  )

  return to
    ? <Link to={to} className={clases}>{cuerpo}</Link>
    : <div className={clases}>{cuerpo}</div>
}
