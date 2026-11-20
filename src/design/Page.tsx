import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageProps {
  /** Título grande de la pantalla. */
  title?: ReactNode
  /** Frase corta bajo el título. */
  subtitle?: ReactNode
  /** Rótulo pequeño encima del título (contexto: el nombre del viaje, la sección). */
  eyebrow?: ReactNode
  /** Enlace «atrás» encima del título: a dónde vuelve y cómo se llama ese sitio. */
  back?: { to: string; label: string }
  /** Botones a la derecha del título. La acción principal va aquí. */
  actions?: ReactNode
  /** Ancho máximo del contenido. narrow: formularios y lectura · default: listas · wide: tableros. */
  width?: 'narrow' | 'default' | 'wide' | 'full'
  className?: string
  children: ReactNode
}

/**
 * Contenedor de TODA pantalla: fija el ancho, los márgenes y la cabecera.
 * Ninguna página pone su propio max-w ni su propio título a mano.
 */
export function Page({ title, subtitle, eyebrow, back, actions, width = 'default', className, children }: PageProps) {
  return (
    <div
      className={cn(
        // El final deja sitio al botón flotante «+» cuando el armazón lo anuncia (--fab-gap).
        'mx-auto w-full px-4 pt-5 pb-[calc(2.5rem+var(--fab-gap,0px))] md:px-8 md:pt-8 animate-rise',
        width === 'narrow' && 'max-w-2xl',
        width === 'default' && 'max-w-4xl',
        width === 'wide' && 'max-w-6xl',
        className,
      )}
    >
      {(title || back || actions) && (
        <header className="mb-6 md:mb-8">
          {back && (
            <Link
              to={back.to}
              className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {back.label}
            </Link>
          )}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
              {title && <h1 className="title-page">{title}</h1>}
              {subtitle && <p className="mt-1 text-[0.9375rem] text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>
      )}
      {children}
    </div>
  )
}

/** Separa bloques dentro de una página con el ritmo vertical estándar. */
export function Stack({ gap = 'md', className, children }: { gap?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  return (
    <div className={cn(gap === 'sm' && 'space-y-3', gap === 'md' && 'space-y-6', gap === 'lg' && 'space-y-10', className)}>
      {children}
    </div>
  )
}
