import { Download, Share, X } from 'lucide-react'
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
      className="flex items-center gap-3 rounded-2xl border border-border bg-card py-2 pl-2.5 pr-1.5 shadow-card"
    >
      {/* El icono de la app, como se verá en la pantalla de inicio. */}
      <img src="/pwa-192.png" alt="" className="size-10 shrink-0 rounded-xl" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">Lleva Wanderlog contigo.</span>{' '}
        <span className="text-muted-foreground">
          {canInstall ? (
            'Instálala y ábrela como una app, también sin conexión.'
          ) : (
            <>
              Toca <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> Compartir y
              luego «Añadir a pantalla de inicio».
            </>
          )}
        </span>
      </p>
      <div className="flex shrink-0 items-center">
        {canInstall && (
          <Button variant="soft" size="sm" className="h-11 md:h-9" onClick={promptInstall}>
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
