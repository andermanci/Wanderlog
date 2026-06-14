import { supabase } from '@/lib/supabase'

// La clave PÚBLICA VAPID no es secreta (el navegador la necesita). Se puede
// sobreescribir con VITE_VAPID_PUBLIC_KEY; si no, usa la del proyecto.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
  ?? 'BERCmlqQzus5JCpFGJgr0qGaceUVoaZuDmRQkBn2l6yH1mILe-Wh3KIksw5wo6pcvuZWITMAGmbCg9VWpv2a6fw'

export type PushStatus = 'unsupported' | 'unconfigured' | 'denied' | 'enabled' | 'disabled'

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'enabled' : 'disabled'
}

export async function enablePush(userId: string): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled'

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
  })

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return 'disabled'

  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh, auth },
    { onConflict: 'endpoint' },
  )
  return 'enabled'
}

export async function disablePush(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'disabled'
}
