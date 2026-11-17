import { ExternalLink } from 'lucide-react'
import { Panel, Row, RowList } from '@/design'
import { navAppsFor, type DirectionsTarget } from '@/lib/directions'

/** «Cómo llegar»: elegir con qué app de mapas ir (Google Maps, Apple Maps, Waze). */
export function DirectionsPanel({ target, onClose }: { target: DirectionsTarget | null; onClose: () => void }) {
  const apps = target ? navAppsFor(target) : []
  return (
    <Panel
      open={!!target}
      onOpenChange={o => { if (!o) onClose() }}
      title="Cómo llegar"
      description={target?.name}
    >
      <RowList>
        {apps.map(app => (
          <a
            key={app.name} href={app.href} target="_blank" rel="noreferrer" onClick={onClose}
            className="block transition-colors hover:bg-secondary/70"
          >
            <Row title={app.name} trailing={<ExternalLink className="size-4" aria-hidden="true" />} />
          </a>
        ))}
      </RowList>
      <p className="mt-3 text-sm text-muted-foreground">Se abre la app si la tienes instalada; si no, en el navegador.</p>
    </Panel>
  )
}
