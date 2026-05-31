import { Outlet, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppLayout() {
  const { tripId } = useParams<{ tripId: string }>()

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar tripId={tripId} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
