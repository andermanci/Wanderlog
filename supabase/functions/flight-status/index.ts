// Supabase Edge Function: flight-status
// Estado real de un vuelo (retraso, terminal, puerta, hora revisada) a partir
// del número que ya guardamos en documents.flight_number (migración 042).
//
// Tiene que ser servidor por dos motivos: la API de vuelos no manda cabeceras
// CORS, y su clave no puede ir en el bundle del navegador. No usa service role:
// reenvía el JWT del usuario y verifica que esté logueado, para que nadie ajeno
// gaste la cuota (mismo patrón que place-photo y share-import).
//
// Proveedor: AeroDataBox vía RapidAPI (tiene capa gratuita). Si el secreto no
// está puesto responde 501 y el cliente simplemente no enseña la tarjeta: la
// funcionalidad queda dormida, no rota.
//
// Deploy: supabase functions deploy flight-status
//   secreto: supabase secrets set AERODATABOX_RAPIDAPI_KEY=...
//            (gratis en rapidapi.com/aedbx-aedbx/api/aerodatabox)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const RAPIDAPI_KEY = Deno.env.get('AERODATABOX_RAPIDAPI_KEY')
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com'

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

// "ib 3456" / "IB-3456" -> "IB3456". La API quiere aerolínea + número pegados.
function normalizeFlightNumber(raw: string): string | null {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // 2-3 caracteres de aerolínea (IB, VY, W6) + 1-4 dígitos de vuelo.
  return /^[A-Z0-9]{2,3}\d{1,4}$/.test(clean) ? clean : null
}

interface AdbTime { utc?: string | null; local?: string | null }
interface AdbPoint {
  airport?: { iata?: string | null; name?: string | null; municipalityName?: string | null } | null
  scheduledTime?: AdbTime | null
  revisedTime?: AdbTime | null
  predictedTime?: AdbTime | null
  terminal?: string | null
  gate?: string | null
  checkInDesk?: string | null
}
interface AdbFlight {
  number?: string | null
  status?: string | null
  airline?: { name?: string | null } | null
  aircraft?: { model?: string | null } | null
  departure?: AdbPoint | null
  arrival?: AdbPoint | null
}

// La hora que de verdad va a pasar: la revisada/estimada si existe, si no la
// programada. AeroDataBox da ambas en local (con offset) y en UTC.
const bestTime = (p: AdbPoint | null | undefined): AdbTime | null =>
  p?.revisedTime ?? p?.predictedTime ?? p?.scheduledTime ?? null

// Los instantes vienen como "2026-07-21 08:05Z" / "2026-07-21 10:05+02:00":
// con espacio en vez de 'T', que Date parsea mal en Safari.
const toIso = (t?: string | null): string | null => (t ? t.replace(' ', 'T') : null)

function delayMinutes(p: AdbPoint | null | undefined): number | null {
  const sched = p?.scheduledTime?.utc
  const real = (p?.revisedTime ?? p?.predictedTime)?.utc
  if (!sched || !real) return null
  const diff = (Date.parse(toIso(real)!) - Date.parse(toIso(sched)!)) / 60000
  return Number.isFinite(diff) ? Math.round(diff) : null
}

function shapePoint(p: AdbPoint | null | undefined) {
  return {
    iata: p?.airport?.iata ?? null,
    airport: p?.airport?.municipalityName ?? p?.airport?.name ?? null,
    scheduled: toIso(p?.scheduledTime?.local),
    estimated: toIso(bestTime(p)?.local),
    terminal: p?.terminal ?? null,
    gate: p?.gate ?? null,
    checkInDesk: p?.checkInDesk ?? null,
    delayMinutes: delayMinutes(p),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 501: "no configurado", distinto de un fallo. El cliente lo trata como
    // "esta función no está disponible" y oculta la tarjeta sin dar error.
    if (!RAPIDAPI_KEY) return json({ error: 'Falta AERODATABOX_RAPIDAPI_KEY', configured: false }, 501)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { flightNumber, date } = await req.json().catch(() => ({}))
    if (!flightNumber || !date) return json({ error: 'Faltan flightNumber o date' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date debe ser YYYY-MM-DD' }, 400)

    const number = normalizeFlightNumber(String(flightNumber))
    if (!number) return json({ error: `Número de vuelo no reconocido: ${flightNumber}` }, 400)

    const url = `https://${RAPIDAPI_HOST}/flights/number/${number}/${date}`
      + '?withAircraftImage=false&withLocation=false'

    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    })

    // 204/404 = el vuelo no está en su base para esa fecha (muy normal si aún
    // faltan semanas). No es un error: es "todavía no hay dato".
    if (res.status === 204 || res.status === 404) return json({ found: false })
    if (res.status === 429) return json({ error: 'Cuota de la API de vuelos agotada' }, 429)
    if (!res.ok) return json({ error: `AeroDataBox: ${res.status} ${await res.text()}` }, 502)

    const body = await res.json().catch(() => null)
    const flights: AdbFlight[] = Array.isArray(body) ? body : body ? [body] : []
    if (!flights.length) return json({ found: false })

    // Un mismo número puede traer varios tramos (escalas): nos quedamos con el
    // que sale antes, que es el que corresponde a la fecha pedida.
    const flight = flights.sort((a, b) => {
      const ta = a.departure?.scheduledTime?.utc ?? ''
      const tb = b.departure?.scheduledTime?.utc ?? ''
      return ta.localeCompare(tb)
    })[0]

    return json({
      found: true,
      number: flight.number ?? number,
      status: flight.status ?? null,
      airline: flight.airline?.name ?? null,
      aircraft: flight.aircraft?.model ?? null,
      departure: shapePoint(flight.departure),
      arrival: shapePoint(flight.arrival),
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
