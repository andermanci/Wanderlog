import { Download, Share, Smartphone, X } from 'lucide-react'
import { Button, IconButton } from '@/design'
import { usePwaInstall } from '@/hooks/usePwaInstall'

// Invitación discreta a instalar la app (el menú nativo del navegador es
// difícil de encontrar). En iOS no hay prompt: se explican los dos toques.
export function PwaInstallBanner() {
  const { installed, canInstall, isIos, dismissed, promptInstall, dismiss } = usePwaInstall()

  if (installed || dismissed || (!canInstall && !isIos)) return null

  return (
    <aside
      aria-label="Instalar Wanderlog"
      className="mb-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl border border-border bg-primary-soft py-3 pl-4 pr-2"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-accent-foreground">
        <Smartphone className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="title-card">Lleva Wanderlog contigo</p>
        <p className="text-sm text-foreground/75">
          {canInstall ? (
            'Instálala para abrirla como una app, también sin conexión.'
          ) : (
            <>
              Toca <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> Compartir y
              luego «Añadir a pantalla de inicio».
            </>
          )}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {canInstall && (
          <Button variant="outline" onClick={promptInstall}>
            <Download aria-hidden="true" />
            Instalar
          </Button>
        )}
        <IconButton label="No mostrar más" onClick={dismiss}>
          <X />
        </IconButton>
      </div>
    </aside>
  )
}
