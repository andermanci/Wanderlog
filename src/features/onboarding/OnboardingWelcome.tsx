import type { ReactNode } from 'react'
import {
  BookOpen, CalendarRange, Home, MapPin, Plane, Plus, Receipt, Search, Ticket, Wallet,
} from 'lucide-react'
import { Button, Modal } from '@/design'
import { cn } from '@/lib/utils'

// Las ilustraciones son las piezas de verdad de la interfaz, en pequeño: así,
// cuando la persona cierre esto, reconoce lo que acaba de ver.

const PESTANAS = [
  { label: 'Inicio', icon: Home },
  { label: 'Plan', icon: CalendarRange },
  { label: 'Guía', icon: BookOpen },
  { label: 'Cartera', icon: Wallet },
  { label: 'Gastos', icon: Receipt },
]

/** La barra de cinco pestañas, con «Inicio» marcada. */
function MiniBarra() {
  return (
    <div className="flex rounded-2xl border border-border bg-card px-1 py-1.5 shadow-card">
      {PESTANAS.map(({ label, icon: Icon }, i) => (
        <span
          key={label}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-0.5 text-2xs font-medium',
            i === 0 ? 'text-accent-foreground' : 'text-muted-foreground',
          )}
        >
          <span className={cn('grid h-6 w-10 place-items-center rounded-full', i === 0 && 'bg-primary-soft')}>
            <Icon className="size-4" strokeWidth={i === 0 ? 2.25 : 1.75} />
          </span>
          <span className="max-w-full truncate">{label}</span>
        </span>
      ))}
    </div>
  )
}

const APUNTES = [
  { label: 'Vuelo', icon: Plane, tone: 'flight' },
  { label: 'Sitio', icon: MapPin, tone: 'place' },
  { label: 'Gasto', icon: Receipt, tone: 'restaurant' },
  { label: 'Billete', icon: Ticket, tone: 'activity' },
]

/** El botón «+» y lo que sale de él. */
function MiniMas() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
        {APUNTES.map(({ label, icon: Icon, tone }) => (
          <span
            key={label}
            data-tone={tone}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium"
          >
            <Icon className="size-3.5 text-tone" />
            {label}
          </span>
        ))}
      </span>
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-raised">
        <Plus className="size-6" />
      </span>
    </div>
  )
}

/** El buscador, con dos resultados por llegar. */
function MiniLupa() {
  return (
    <div className="space-y-2">
      <div className="flex h-10 items-center gap-2 rounded-full border border-border-strong bg-card px-3.5 text-sm text-muted-foreground shadow-card">
        <Search className="size-4 shrink-0 text-foreground" />
        <span className="truncate">Buscar…</span>
      </div>
      <div className="space-y-1.5 px-3.5">
        <span className="block h-2 w-3/5 rounded-full bg-border-strong" />
        <span className="block h-2 w-2/5 rounded-full bg-border" />
      </div>
    </div>
  )
}

const IDEAS: { ilustracion: ReactNode; title: string; text: string }[] = [
  {
    ilustracion: <MiniBarra />,
    title: 'Cada viaje tiene cinco sitios',
    text: 'Inicio, Plan, Guía, Cartera y Gastos. Están siempre en la barra: abajo en el móvil, arriba en el ordenador.',
  },
  {
    ilustracion: <MiniMas />,
    title: 'El botón «+» añade cualquier cosa',
    text: 'Un vuelo, un sitio que ver, un gasto, un billete… Púlsalo y elige qué quieres apuntar.',
  },
  {
    ilustracion: <MiniLupa />,
    title: 'La lupa lo encuentra todo',
    text: 'Escribe lo que buscas (una reserva, un restaurante, un documento) y te lleva hasta ello.',
  },
]

// Bienvenida de primer uso: 3 ideas clave, lenguaje cercano y un solo botón.
export function OnboardingWelcome({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={o => !o && onClose()}
      size="sm"
      title="Te damos la bienvenida"
      description="Wanderlog guarda todo tu viaje en un sitio. Con estas tres cosas ya sabes usarlo:"
    >
      <ol className="space-y-6 pt-3">
        {IDEAS.map(({ ilustracion, title, text }, i) => (
          <li key={title}>
            <div aria-hidden="true" className="rounded-2xl bg-sunken p-3">
              {ilustracion}
            </div>
            <div className="mt-3 flex items-baseline gap-3 px-1">
              <span aria-hidden="true" className="font-serif text-2xl font-medium leading-none tabular-nums text-primary">{i + 1}</span>
              <div className="min-w-0">
                <p className="font-serif text-lg font-medium leading-snug tracking-tight">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="primary" size="lg" block className="mt-7" onClick={onClose}>
        Empezar
      </Button>
    </Modal>
  )
}
