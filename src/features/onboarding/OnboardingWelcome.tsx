import { LayoutGrid, Plus, Search } from 'lucide-react'
import { Button, Modal } from '@/design'

const IDEAS = [
  {
    icon: LayoutGrid,
    title: 'Cada viaje tiene cinco sitios',
    text: 'Inicio, Plan, Guía, Cartera y Gastos. Están siempre en la barra: abajo en el móvil, arriba en el ordenador.',
  },
  {
    icon: Plus,
    title: 'El botón «+» añade cualquier cosa',
    text: 'Un vuelo, un sitio que ver, un gasto, un billete… Púlsalo y elige qué quieres apuntar.',
  },
  {
    icon: Search,
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
      <ol className="space-y-4 pt-3">
        {IDEAS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="title-card">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="primary" size="lg" block className="mt-6" onClick={onClose}>
        Empezar
      </Button>
    </Modal>
  )
}
