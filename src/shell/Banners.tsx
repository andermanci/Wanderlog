import { Lock, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useMyLimits } from '@/lib/queries/limits'
import { bloqueoParaEditar } from '@/lib/limits'

// Aviso tranquilizador sin conexión: la app sigue siendo usable (caché) y los
// cambios se sincronizan al reconectar.
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div role="status" aria-live="polite" className="flex shrink-0 items-center justify-center gap-2 bg-primary-soft px-4 py-2 text-center text-xs font-medium text-accent-foreground">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      Sin conexión. Puedes seguir viendo tu viaje; los cambios se guardarán al reconectar.
    </div>
  )
}

// Una cuenta suspendida sigue pudiendo entrar, leer y descargar sus viajes; lo
// que no puede es cambiar nada. Sin este aviso lo iría descubriendo botón a
// botón, y cada fallo parecería una avería.
export function CuentaSuspendidaBanner() {
  const { data: limites } = useMyLimits()
  // El texto sale de `limits.ts`, el mismo módulo que deshabilita los botones.
  const motivo = bloqueoParaEditar(limites)
  if (!motivo) return null
  return (
    <div role="status" data-tone="danger" className="flex shrink-0 items-start gap-2.5 border-b border-tone-line bg-tone-soft px-4 py-2.5 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-tone" aria-hidden="true" />
      <p>{motivo} Escríbenos si crees que es un error.</p>
    </div>
  )
}
