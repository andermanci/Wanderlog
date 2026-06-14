// Supabase Edge Function: send-reminders
// Envía notificaciones Web Push de los recordatorios vencidos.
// Programar con cron (cada ~15 min) desde el panel de Supabase o pg_cron.
// Secrets necesarios: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Despliega con: supabase functions deploy send-reminders

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@wanderlog.app'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }

Deno.serve(async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID no configurado' }), { status: 500 })
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date()
  // Vencidos en las últimas 24 h y aún no enviados (margen por si el cron falla).
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*, trips(name)')
    .eq('is_sent', false)
    .lte('remind_at', now.toISOString())
    .gte('remind_at', dayAgo.toISOString())

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let sent = 0
  for (const r of reminders ?? []) {
    const tripName = (r as unknown as { trips: { name: string } | null }).trips?.name ?? 'Tu viaje'
    const payload = JSON.stringify({
      title: `🔔 ${r.title}`,
      body: `${tripName} · ${new Date(r.remind_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`,
      url: `/trips/${r.trip_id}`,
    })

    const { data: subs } = await supabase
      .from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', r.user_id)

    for (const s of (subs ?? []) as Sub[]) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id) // suscripción muerta
        } else {
          console.error('[send-reminders] push error:', status, (e as Error).message)
        }
      }
    }

    await supabase.from('reminders').update({ is_sent: true }).eq('id', r.id)
  }

  return new Response(
    JSON.stringify({ processed: reminders?.length ?? 0, sent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
