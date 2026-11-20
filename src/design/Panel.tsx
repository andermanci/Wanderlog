import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton } from './Button'

const overlay =
  'fixed inset-0 z-50 bg-[oklch(0.2_0.02_50/0.45)] backdrop-blur-[2px] ' +
  'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out'

interface PanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Botones fijos abajo (Guardar, Cancelar…). */
  footer?: ReactNode
  /** Acciones junto al título (un menú, un botón de editar). */
  actions?: ReactNode
  /** Si se pasa, sale una flecha «atrás» en vez de solo la X (pasos de un asistente). */
  onBack?: () => void
  /** Ancho en escritorio. md 30rem · lg 40rem · xl 56rem. */
  size?: 'md' | 'lg' | 'xl'
  /** Sin relleno en el cuerpo (para una foto a sangre, un mapa…). */
  flush?: boolean
  className?: string
  children: ReactNode
}

/**
 * EL patrón para crear, editar y ver el detalle de algo.
 * Escritorio: panel lateral derecho. Móvil: hoja inferior.
 * No se anidan: si un paso lleva a otro, se cambia el contenido del mismo panel.
 */
export function Panel({
  open, onOpenChange, title, description, footer, actions, onBack, size = 'md', flush, className, children,
}: PanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-card text-card-foreground shadow-float outline-none',
            // Móvil: hoja inferior
            'inset-x-0 bottom-0 max-h-[94dvh] rounded-t-3xl',
            'data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
            // Escritorio: panel lateral
            'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:rounded-l-3xl md:border-l md:border-border',
            'md:data-[state=open]:animate-side-in md:data-[state=closed]:animate-side-out',
            size === 'md' && 'md:w-[30rem]',
            size === 'lg' && 'md:w-[40rem]',
            size === 'xl' && 'md:w-[56rem]',
            'md:max-w-[calc(100vw-4rem)]',
            className,
          )}
        >
          {/* Asa: indica que la hoja se puede cerrar (solo móvil) */}
          <div aria-hidden="true" className="md:hidden mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" />
          <header className="flex items-start gap-2 px-5 pt-3 pb-3 md:px-7 md:pt-6 shrink-0">
            {onBack && (
              <IconButton label="Atrás" size="sm" variant="secondary" onClick={onBack} className="-ml-1 mt-0.5">
                <ArrowLeft />
              </IconButton>
            )}
            <div className="min-w-0 flex-1 py-0.5">
              {/* Hasta dos líneas: los títulos que son una pregunta no caben en una en el móvil. */}
              <Dialog.Title className="title-section line-clamp-2 break-words">{title}</Dialog.Title>
              {description
                ? <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">Panel</Dialog.Description>}
            </div>
            {actions}
            <Dialog.Close asChild>
              <IconButton label="Cerrar" size="sm" variant="secondary" className="-mr-1 mt-0.5"><X /></IconButton>
            </Dialog.Close>
          </header>
          <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', !flush && 'px-5 pb-6 md:px-7', !footer && 'pb-[max(1.5rem,env(safe-area-inset-bottom))]')}>
            {children}
          </div>
          {footer && (
            <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-7 md:pb-5 md:rounded-bl-3xl [&>*]:flex-1 md:[&>*]:flex-none">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Oculta el título a la vista (sigue leyéndose): visores de fotos, códigos… */
  hideTitle?: boolean
  size?: 'sm' | 'md' | 'lg' | 'full'
  footer?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Ventana centrada, para cosas que se MIRAN y se cierran: un código QR, una foto,
 * un mapa, un aviso. Para formularios se usa <Panel>.
 */
export function Modal({ open, onOpenChange, title, description, hideTitle, size = 'md', footer, className, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col outline-none',
            'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] rounded-3xl bg-card text-card-foreground shadow-float',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
            size === 'sm' && 'max-w-sm',
            size === 'md' && 'max-w-lg',
            size === 'lg' && 'max-w-3xl',
            size === 'full' && 'max-w-6xl h-[calc(100dvh-2rem)]',
            className,
          )}
        >
          <header className={cn('flex items-start gap-3 px-6 pt-5 pb-2 shrink-0', hideTitle && 'absolute right-0 top-0 z-10 p-3')}>
            <div className={cn('min-w-0 flex-1', hideTitle && 'sr-only')}>
              <Dialog.Title className="title-section">{title}</Dialog.Title>
              {description
                ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">Ventana</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Cerrar" size="sm" variant="secondary" className="-mr-2"><X /></IconButton>
            </Dialog.Close>
          </header>
          <div className={cn('flex-1 min-h-0 overflow-y-auto', hideTitle ? '' : 'px-6 pb-6')}>{children}</div>
          {footer && (
            <footer className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Acción que destruye algo: el botón sale en rojo. */
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
}

/** Pregunta de sí o no antes de algo que no se puede deshacer. */
export function Confirm({
  open, onOpenChange, title, description, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger, loading, onConfirm,
}: ConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={cn(overlay, 'z-[60]')} />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card p-6 shadow-float outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          <AlertDialog.Title className="title-section">{title}</AlertDialog.Title>
          {description
            ? <AlertDialog.Description className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</AlertDialog.Description>
            : <AlertDialog.Description className="sr-only">Confirmación</AlertDialog.Description>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={danger ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
