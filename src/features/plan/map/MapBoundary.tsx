import { Component, type ReactNode } from 'react'
import { MapPinOff } from 'lucide-react'
import { Empty } from '@/design'

/**
 * Si el mapa revienta (Google rechaza la clave en ese dominio, no hay conexión,
 * falla un marcador…), que se caiga solo el mapa y no la pantalla entera del
 * Plan: la lista de días sigue funcionando.
 */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('El mapa del Plan ha fallado:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid h-full place-items-center bg-sunken p-6">
        <Empty
          bare icon={MapPinOff}
          title="No se ha podido cargar el mapa"
          description="Puede que no tengas conexión. El plan sigue disponible en la lista."
        />
      </div>
    )
  }
}
