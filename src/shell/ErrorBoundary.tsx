import { Component, type ReactNode } from 'react'
import { Compass, RotateCcw } from 'lucide-react'
import { Button, Empty } from '@/design'

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Red de seguridad: si algo falla, en vez de pantalla en blanco se dice claro
// y se ofrece reintentar.
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
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <Empty
          bare
          icon={Compass}
          title="Algo ha fallado"
          description="Ha ocurrido un problema al mostrar esta pantalla. Tus datos están a salvo."
        >
          <Button variant="primary" onClick={() => window.location.reload()}>
            <RotateCcw /> Reintentar
          </Button>
        </Empty>
      </div>
    )
  }
}
