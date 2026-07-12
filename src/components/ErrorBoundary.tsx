import { Component, type ReactNode } from 'react'
import { Compass, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Red de seguridad: si algo falla, en vez de pantalla en blanco mostramos un
// mensaje claro y un botón para reintentar.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Error capturado por ErrorBoundary:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 gap-4 bg-background">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}>
          <Compass size={26} style={{ color: 'var(--primary)' }} aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-medium">Algo ha fallado</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm">
            Ha ocurrido un problema al mostrar esta pantalla. Tus datos están a salvo.
          </p>
        </div>
        <Button className="gap-2" onClick={() => window.location.reload()}
          variant="brand">
          <RotateCcw size={16} aria-hidden="true" /> Reintentar
        </Button>
      </div>
    )
  }
}
