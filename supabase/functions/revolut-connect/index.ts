// Supabase Edge Function: revolut-connect
// Inicia el flujo de consentimiento de open banking (GoCardless) para un viaje.
// Devuelve la URL de consentimiento a la que redirigir al usuario.
// Deploy: supabase functions deploy revolut-connect

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, getAccessToken, gcFetch, resolveInstitutionId } from '../_shared/gocardless.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    // Cliente con el JWT del usuario para identificarlo.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { tripId } = await req.json().catch(() => ({}))
    if (!tripId) return json({ error: 'Falta tripId' }, 400)

    // El usuario debe tener acceso al viaje (RLS lo garantiza vía userClient).
    const { data: trip, error: tripErr } = await userClient
      .from('trips').select('id').eq('id', tripId).single()
    if (tripErr || !trip) return json({ error: 'Viaje no encontrado o sin acceso' }, 403)

    const token = await getAccessToken()
    const institutionId = await resolveInstitutionId(token, 'es')

    // Máximo histórico que permite la institución (para capturar reservas previas).
    const inst = await gcFetch(token, `/institutions/${institutionId}/`)
    const maxHistorical = Math.min(365, Number(inst.transaction_total_days) || 90)

    // Acuerdo de usuario: 90 días de validez, histórico máximo permitido.
    const agreement = await gcFetch(token, '/agreements/enduser/', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: maxHistorical,
        access_valid_for_days: 90,
        access_scope: ['balances', 'details', 'transactions'],
      }),
    })

    const redirect = `${APP_URL}/import/revolut/callback?trip=${tripId}`
    const requisition = await gcFetch(token, '/requisitions/', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: institutionId,
        agreement: agreement.id,
        redirect,
        reference: `${user.id}:${tripId}:${Date.now()}`,
        user_language: 'ES',
      }),
    })

    // Guardamos la conexión pendiente con service role.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    await admin.from('bank_connections').insert({
      user_id: user.id,
      trip_id: tripId,
      provider: 'revolut',
      requisition_id: requisition.id,
      institution_id: institutionId,
      status: 'pending',
    })

    return json({ link: requisition.link, requisitionId: requisition.id })
  } catch (e) {
    console.error('[revolut-connect]', e)
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500)
  }
})
