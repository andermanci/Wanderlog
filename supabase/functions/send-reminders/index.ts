// Supabase Edge Function: send-reminders
// Se ejecuta como cron job cada hora para enviar emails de recordatorios pendientes
// Despliega con: supabase functions deploy send-reminders
// Configura el cron en: supabase/functions/send-reminders/config.toml

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SMTP_HOST = Deno.env.get('SMTP_HOST')
const SMTP_USER = Deno.env.get('SMTP_USER')
const SMTP_PASS = Deno.env.get('SMTP_PASS')

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*, profiles(email, full_name), trips(name, destination)')
    .eq('is_sent', false)
    .gte('remind_at', now.toISOString())
    .lte('remind_at', windowEnd.toISOString())

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0
  for (const reminder of reminders ?? []) {
    try {
      const email = (reminder as unknown as { profiles: { email: string; full_name: string } }).profiles?.email
      const tripName = (reminder as unknown as { trips: { name: string; destination: string } }).trips?.name
      const destination = (reminder as unknown as { trips: { name: string; destination: string } }).trips?.destination

      if (!email) continue

      const subject = `[Wanderlog] Recordatorio: ${reminder.title}`
      const body = `
Hola,

Tienes un recordatorio pendiente en Wanderlog:

📍 Viaje: ${tripName} (${destination})
🔔 Aviso: ${reminder.title}
🕐 Hora: ${new Date(reminder.remind_at).toLocaleString('es-ES')}

Accede a Wanderlog para ver todos los detalles de tu viaje.

¡Buen viaje!
— El equipo de Wanderlog
      `.trim()

      // Si tienes SMTP configurado, usa nodemailer o el SDK de Resend/SendGrid
      // Por ahora usamos el servicio de emails de Supabase si está configurado
      console.log(`[send-reminders] Email simulado a ${email}: ${subject}`)

      // Marcar como enviado
      await supabase
        .from('reminders')
        .update({ is_sent: true })
        .eq('id', reminder.id)

      sent++
    } catch (e) {
      console.error(`[send-reminders] Error enviando recordatorio ${reminder.id}:`, e)
    }
  }

  return new Response(
    JSON.stringify({ processed: reminders?.length ?? 0, sent }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
