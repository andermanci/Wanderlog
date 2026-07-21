import { Navigation, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { navAppsFor, type DirectionsTarget } from '@/lib/directions'

// Selector de app de mapas para "Cómo llegar" (Google/Apple/Waze).
export function DirectionsDialog({ target, onClose }: {
  target: DirectionsTarget | null
  onClose: () => void
}) {
  const navApps = target ? navAppsFor(target) : []
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="surface">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Navigation size={18} style={{ color: 'var(--primary)' }} />
            Cómo llegar
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">{target?.name}</p>
        <div className="grid gap-2 py-2">
          {navApps.map(app => (
            <a
              key={app.name}
              href={app.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:border-primary transition-colors"
              style={{ background: 'var(--secondary)' }}
            >
              <span className="text-sm font-medium">{app.name}</span>
              <ExternalLink size={14} className="text-muted-foreground" />
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Se abrirá la app si la tienes instalada; si no, en el navegador.</p>
      </DialogContent>
    </Dialog>
  )
}
