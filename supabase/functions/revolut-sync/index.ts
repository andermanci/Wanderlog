// Supabase Edge Function: revolut-sync
// Dos modos:
//  - preview: lista los movimientos (débitos) candidatos en una ventana amplia
//    (desde N días antes del viaje hasta su fin), marcando cuáles caen dentro
//    del viaje y cuáles ya se importaron. NO escribe.
//  - import: importa como gastos solo los movimientos seleccionados (por external_id).
// Deploy: supabase functions deploy revolut-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, getAccessToken, gcFetch } from '../_shared/gocardless.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// Cuántos días antes del inicio del viaje miramos (para reservas previas).
const LOOKBACK_DAYS = 180

interface GcTx {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  creditorName?: string
}

interface Candidate {
  external_id: string
  date: string
  amount: number
  currency: string
  description: string
  inTripRange: boolean
  alreadyImported: boolean
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { tripId, mode = 'preview', externalIds = [] } = await req.json().catch(() => ({}))
    if (!tripId) return json({ error: 'Falta tripId' }, 400)

    const { data: trip, error: tripErr } = await userClient
      .from('trips').select('id, start_date, end_date').eq('id', tripId).single()
    if (tripErr || !trip) return json({ error: 'Viaje no encontrado o sin acceso' }, 403)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: conn } = await admin
      .from('bank_connections')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conn) return json({ error: 'No hay conexión de Revolut para este viaje' }, 404)

    const token = await getAccessToken()
    const requisition = await gcFetch(token, `/requisitions/${conn.requisition_id}/`)
    const accounts: string[] = requisition.accounts ?? []
    if (!accounts.length) {
      await admin.from('bank_connections').update({ status: 'pending' }).eq('id', conn.id)
      return json({ pending: true, candidates: [] })
    }

    // Marca la conexión como vinculada.
    if (conn.status !== 'linked' || !conn.account_id) {
      await admin.from('bank_connections')
        .update({ status: 'linked', account_id: accounts[0] }).eq('id', conn.id)
    }

    const windowStart = addDays(trip.start_date, -LOOKBACK_DAYS)
    const windowEnd = trip.end_date

    // Recoge todos los débitos de la ventana de todas las cuentas.
    // Acotamos por fecha en la propia API: pedir el histórico completo y filtrar
    // aquí después gastaba el cupo de GoCardless (4 peticiones por día y cuenta)
    // trayendo años de movimientos que íbamos a descartar igualmente.
    const range = `?date_from=${windowStart}&date_to=${windowEnd}`
    const txs: GcTx[] = []
    for (const accountId of accounts) {
      const resp = await gcFetch(token, `/accounts/${accountId}/transactions/${range}`)
      txs.push(...(resp.transactions?.booked ?? []))
    }

    const inWindow = txs
      .map((tx) => {
        const date = (tx.bookingDate ?? tx.valueDate ?? '').slice(0, 10)
        const amount = Number(tx.transactionAmount.amount)
        const external_id = tx.transactionId ?? tx.internalTransactionId
        return { tx, date, amount, external_id }
      })
      .filter((x) =>
        x.external_id && x.date >= windowStart && x.date <= windowEnd &&
        Number.isFinite(x.amount) && x.amount < 0)

    // ¿Cuáles ya están importados en este viaje?
    const ids = inWindow.map((x) => x.external_id!) as string[]
    const importedSet = new Set<string>()
    if (ids.length) {
      const { data: existing } = await admin
        .from('expenses').select('external_id').eq('trip_id', tripId).in('external_id', ids)
      for (const e of existing ?? []) if (e.external_id) importedSet.add(e.external_id)
    }

    // ---------- MODO PREVIEW ----------
    if (mode === 'preview') {
      const candidates: Candidate[] = inWindow.map(({ tx, date, amount, external_id }) => ({
        external_id: external_id!,
        date,
        amount: Math.abs(amount),
        currency: tx.transactionAmount.currency,
        description: tx.remittanceInformationUnstructured || tx.creditorName || 'Movimiento Revolut',
        inTripRange: date >= trip.start_date && date <= trip.end_date,
        alreadyImported: importedSet.has(external_id!),
      })).sort((a, b) => (a.date < b.date ? 1 : -1))
      return json({ candidates })
    }

    // ---------- MODO IMPORT ----------
    const selected = new Set<string>(externalIds)
    let imported = 0
    let skipped = 0
    for (const { tx, date, amount, external_id } of inWindow) {
      if (!selected.has(external_id!) || importedSet.has(external_id!)) { skipped++; continue }
      const description =
        tx.remittanceInformationUnstructured || tx.creditorName || 'Movimiento Revolut'
      const { data: ins, error: insErr } = await admin
        .from('expenses')
        .upsert({
          trip_id: tripId,
          category: 'Otros',
          description,
          amount: Math.abs(amount),
          currency: tx.transactionAmount.currency,
          date,
          source: 'revolut',
          external_id,
        }, { onConflict: 'trip_id,external_id', ignoreDuplicates: true })
        .select('id')
      if (insErr) { console.error('[revolut-sync] upsert', insErr); skipped++ }
      else if (ins && ins.length > 0) imported++
      else skipped++
    }

    return json({ imported, skipped })
  } catch (e) {
    console.error('[revolut-sync]', e)
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500)
  }
})
