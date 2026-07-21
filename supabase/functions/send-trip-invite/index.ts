// Supabase Edge Function: send-trip-invite
// Avisa por correo a quien acabas de invitar a un viaje, con un enlace
// /invite/<token> que funciona tanto si ya tiene cuenta como si no.
//
// Tiene que ser servidor por dos motivos: las credenciales de correo no pueden
// ir en el bundle, y hay que leer datos (el correo del invitado, el nombre de
// quien invita) con service role.
//
// Autorización: se reenvía el JWT del usuario y se comprueba can_share_trip
// sobre ESE viaje. Sin eso, cualquiera con la anon key podría usar la función
// como pasarela para mandar correos (mismo patrón que share-import).
//
// Deploy: supabase functions deploy send-trip-invite
// Secretos:
//   supabase secrets set GMAIL_USER=tu@gmail.com
//   supabase secrets set GMAIL_APP_PASSWORD=xxxx   (contraseña de aplicación,
//     myaccount.google.com > Seguridad; requiere verificación en 2 pasos)
//   supabase secrets set APP_URL=https://tu-dominio

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Reenviar el mismo correo una y otra vez es spam (y Gmail lo nota): se deja
// un minuto de margen, suficiente para que un doble clic no mande dos.
const RESEND_COOLDOWN_MS = 60 * 1000

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "12 – 22 de mayo de 2026" / "12 de mayo – 3 de junio de 2026"
function formatRange(start: string, end: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', opts)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const sameMonth = sameYear && start.slice(0, 7) === end.slice(0, 7)
  if (sameMonth) {
    return `${fmt(start, { day: 'numeric' })} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  if (sameYear) {
    return `${fmt(start, { day: 'numeric', month: 'long' })} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return `${fmt(start, { day: 'numeric', month: 'long', year: 'numeric' })} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

interface Trip {
  name: string
  destination: string
  start_date: string
  end_date: string
  cover_image_url: string | null
}

// Los clientes de correo no entienden ni flex ni variables CSS: tablas y
// estilos en línea, como manda la tradición.
function buildHtml(o: {
  inviter: string
  trip: Trip
  url: string
  hasAccount: boolean
}): string {
  const dates = formatRange(o.trip.start_date, o.trip.end_date)
  const cover = o.trip.cover_image_url
    ? `<tr><td style="padding:0 0 20px"><img src="${escapeHtml(o.trip.cover_image_url)}" width="520" alt="" style="width:100%;max-width:520px;height:auto;border-radius:12px;display:block"></td></tr>`
    : ''
  const cta = o.hasAccount ? 'Ver el viaje' : 'Unirme al viaje'
  const foot = o.hasAccount
    ? 'Se abrirá directamente en tu cuenta de Wanderlog.'
    : '¿Todavía no tienes cuenta? Se crea en el mismo enlace, en menos de un minuto y sin contraseñas.'

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px 12px;background:#f6f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="520" style="width:100%;max-width:520px;background:#fffdfb;border:1px solid #e7e2dc;border-radius:16px;padding:32px">
    <tr><td style="padding:0 0 8px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a8178">Wanderlog</td></tr>
    <tr><td style="padding:0 0 20px;font-size:22px;line-height:1.3;font-weight:600">
      ${escapeHtml(o.inviter)} te invita a un viaje
    </td></tr>
    ${cover}
    <tr><td style="padding:0 0 4px;font-size:20px;font-weight:600">${escapeHtml(o.trip.name)}</td></tr>
    <tr><td style="padding:0 0 24px;font-size:15px;color:#6b6259">
      ${escapeHtml(o.trip.destination)}<br>${escapeHtml(dates)}
    </td></tr>
    <tr><td style="padding:0 0 24px">
      <a href="${escapeHtml(o.url)}" style="display:inline-block;background:#1c1917;color:#fffdfb;text-decoration:none;font-size:16px;font-weight:500;padding:14px 28px;border-radius:10px">${cta}</a>
    </td></tr>
    <tr><td style="padding:0 0 16px;font-size:14px;line-height:1.5;color:#6b6259">
      Podrás ver el itinerario, los documentos y los gastos del viaje. ${escapeHtml(foot)}
    </td></tr>
    <tr><td style="padding-top:16px;border-top:1px solid #e7e2dc;font-size:12px;line-height:1.5;color:#8a8178">
      Si no esperabas esta invitación, ignora este correo y no pasará nada.<br>
      Si el botón no funciona, copia este enlace: <br>
      <span style="word-break:break-all">${escapeHtml(o.url)}</span>
    </td></tr>
  </table>
</body></html>`
}

function buildText(o: { inviter: string; trip: Trip; url: string }): string {
  return [
    `${o.inviter} te invita a un viaje en Wanderlog.`,
    '',
    o.trip.name,
    `${o.trip.destination} · ${formatRange(o.trip.start_date, o.trip.end_date)}`,
    '',
    `Únete aquí: ${o.url}`,
    '',
    'Si no esperabas esta invitación, ignora este correo.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let client: SMTPClient | null = null
  try {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json({ error: 'Falta GMAIL_USER / GMAIL_APP_PASSWORD' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { collaboratorId } = await req.json().catch(() => ({}))
    if (!collaboratorId) return json({ error: 'Falta collaboratorId' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: collab } = await admin
      .from('trip_collaborators')
      .select('id, trip_id, email, user_id, invited_by, invite_token, invite_sent_at, accepted_at')
      .eq('id', collaboratorId)
      .maybeSingle()
    if (!collab) return json({ error: 'Invitación no encontrada' }, 404)

    // Autorización real: ¿este usuario puede compartir ESTE viaje?
    const { data: canShare } = await userClient.rpc('can_share_trip', { p_trip_id: collab.trip_id })
    if (!canShare) return json({ error: 'No tienes permiso para compartir este viaje' }, 403)

    if (collab.accepted_at) return json({ skipped: 'already_accepted' })
    if (collab.invite_sent_at &&
        Date.now() - new Date(collab.invite_sent_at).getTime() < RESEND_COOLDOWN_MS) {
      return json({ skipped: 'cooldown' })
    }

    const { data: trip } = await admin
      .from('trips')
      .select('name, destination, start_date, end_date, cover_image_url')
      .eq('id', collab.trip_id)
      .maybeSingle()
    if (!trip) return json({ error: 'Viaje no encontrado' }, 404)

    const { data: inviter } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', collab.invited_by)
      .maybeSingle()
    const inviterName = inviter?.full_name?.trim() || inviter?.email || 'Alguien'

    // El Origin de quien llama sirve de respaldo (y hace que en local el
    // enlace apunte a localhost en vez de a producción).
    const origin = req.headers.get('origin') ?? ''
    const base = (APP_URL || origin).replace(/\/$/, '')
    if (!base) return json({ error: 'Falta APP_URL' }, 500)
    const url = `${base}/invite/${collab.invite_token}`

    client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    })

    await client.send({
      from: `Wanderlog <${GMAIL_USER}>`,
      to: collab.email,
      // Responder al correo escribe a quien invita, no a un buzón muerto.
      replyTo: inviter?.email || undefined,
      subject: `${inviterName} te invita a "${trip.name}" en Wanderlog`,
      content: buildText({ inviter: inviterName, trip: trip as Trip, url }),
      html: buildHtml({
        inviter: inviterName,
        trip: trip as Trip,
        url,
        hasAccount: !!collab.user_id,
      }),
    })

    await admin
      .from('trip_collaborators')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', collab.id)

    return json({ sent: true, email: collab.email })
  } catch (e) {
    console.error('[send-trip-invite]', e)
    return json({ error: e instanceof Error ? e.message : 'Error enviando la invitación' }, 500)
  } finally {
    // Ojo: close() no siempre devuelve promesa, así que un `.catch()` encadenado
    // revienta AQUÍ y se lleva por delante la respuesta (500 sin cuerpo).
    try { await client?.close() } catch { /* la conexión ya se cerró sola */ }
  }
})
