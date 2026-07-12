import { X, Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/hooks/usePwaInstall'

// Invitación discreta a instalar la app (el menú nativo del navegador es
// difícil de encontrar). En iOS no hay prompt: se explican los dos toques.
export function PwaInstallBanner() {
  const { installed, canInstall, isIos, dismissed, promptInstall, dismiss } = usePwaInstall()

  if (installed || dismissed || (!canInstall && !isIos)) return null

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl mb-6"
      style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
        <Download size={17} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Lleva Wanderlog contigo</p>
        {canInstall ? (
          <p className="text-xs text-muted-foreground">Instálala para abrirla como una app, también sin conexión.</p>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
            Toca <Share size={12} className="inline flex-shrink-0" aria-label="Compartir" /> Compartir y luego «Añadir a pantalla de inicio».
          </p>
        )}
      </div>
      {canInstall && (
        <Button size="sm" variant="brand" className="flex-shrink-0" onClick={promptInstall}>
          Instalar
        </Button>
      )}
      <Button size="icon" variant="ghost" className="w-7 h-7 flex-shrink-0 text-muted-foreground"
        onClick={dismiss} aria-label="No mostrar más">
        <X size={14} />
      </Button>
    </div>
  )
}
