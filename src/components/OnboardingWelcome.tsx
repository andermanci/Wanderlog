import { Map, FileText, WifiOff, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const STEPS = [
  { icon: Map, title: 'Planifica a tu ritmo', text: 'Crea un viaje y organiza el día a día: vuelos, hoteles, sitios que ver, gastos…' },
  { icon: FileText, title: 'Lleva tus documentos', text: 'Guarda DNI, billetes y reservas. Los tienes siempre a mano, ordenados.' },
  { icon: WifiOff, title: 'Funciona sin conexión', text: 'Una vez abierto, tu viaje se ve aunque no tengas internet. Ideal estando fuera.' },
]

// Bienvenida de primer uso: 3 ideas clave, lenguaje cercano y un solo botón.
export function OnboardingWelcome({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface">
        <DialogHeader>
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}>
              <Compass size={24} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            </div>
            <DialogTitle className="font-serif text-2xl">Te damos la bienvenida</DialogTitle>
            <DialogDescription>Tu viaje, todo en un sitio y fácil de usar. En resumen:</DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--secondary)' }}>
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
                <Icon size={18} style={{ color: 'var(--primary)' }} aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <Button className="w-full" onClick={onClose}
          variant="brand">
          Empezar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
