import { Outlet, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppLayout() {
  const { tripId } = useParams<{ tripId: string }>()

  return (
    <TooltipProvider>
      {/* pt de safe-area: en PWA standalone el contenido se extiende tras la
          barra de estado del móvil (notch); así nada queda tapado por ella */}
      <div
        className="flex h-dvh overflow-hidden bg-background"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Sidebar solo en escritorio */}
        <div className="hidden md:flex h-full">
          <Sidebar tripId={tripId} />
        </div>
        {/* pb extra en móvil para no quedar tapado por la navegación inferior */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
        {/* Navegación inferior solo en móvil */}
        <BottomNav tripId={tripId} />
      </div>
    </TooltipProvider>
  )
}
