import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

// Banner global tranquilizador cuando no hay conexión: la app sigue siendo
// usable (caché offline) y los cambios se sincronizan al reconectar.
export function OfflineBanner() {
  const online = useOnlineStatus()

  if (online) return null
  return (
    <div role="status" aria-live="polite"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-center"
      style={{ background: 'color-mix(in srgb, var(--primary) 16%, var(--card))', color: 'var(--foreground)', borderBottom: '1px solid var(--border)' }}>
      <WifiOff size={14} aria-hidden="true" style={{ color: 'var(--primary)' }} />
      Sin conexión · Puedes seguir viendo tu viaje; los cambios se guardarán al reconectar
    </div>
  )
}
