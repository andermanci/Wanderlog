import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellOff, BellRing } from 'lucide-react'
import { Button, Notice } from '@/design'
import { enablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { useAuthStore } from '@/store/authStore'

/**
 * Invita a activar las notificaciones si aún no lo están. Los avisos llegan por
 * push: pedir solo el permiso del navegador no suscribe a nada, así que se usa
 * enablePush, que hace las dos cosas.
 */
export function PushBanner() {
  const { user } = useAuthStore()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let alive = true
    getPushStatus().then(s => { if (alive) setStatus(s) }).catch(() => { /* sin estado, sin banner */ })
    return () => { alive = false }
  }, [])

  async function activate() {
    if (!user) return
    setWorking(true)
    try {
      const next = await enablePush(user.id)
      setStatus(next)
      if (next === 'enabled') toast.success('Notificaciones activadas')
      else if (next === 'denied') toast.error('Has bloqueado las notificaciones en este navegador')
      else if (next === 'unsupported') toast.error('Este navegador no admite notificaciones')
    } catch {
      toast.error('No se han podido activar las notificaciones')
    } finally {
      setWorking(false)
    }
  }

  if (status === null || status === 'enabled') return null

  if (status === 'unsupported') {
    return (
      <Notice tone="neutral" icon={BellOff} title="Este navegador no admite notificaciones">
        Puedes crear avisos, pero no te llegarán a este dispositivo.
      </Notice>
    )
  }

  if (status === 'denied') {
    return (
      <Notice tone="warning" icon={BellOff} title="Las notificaciones están bloqueadas">
        Para recibir los avisos, permite las notificaciones de esta página en los ajustes del navegador.
      </Notice>
    )
  }

  return (
    <Notice
      tone="primary"
      icon={BellRing}
      title="Activa las notificaciones"
      action={<Button variant="primary" size="sm" loading={working} onClick={activate}>Activar</Button>}
    >
      Sin ellas, los avisos no te llegarán cuando toque.
    </Notice>
  )
}
