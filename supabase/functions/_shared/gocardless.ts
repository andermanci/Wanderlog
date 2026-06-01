// Helpers compartidos para la API de GoCardless Bank Account Data (Nordigen)
// Docs: https://bankaccountdata.gocardless.com/api/v2/

const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Token de acceso (válido ~24h). Pedimos uno fresco en cada invocación.
export async function getAccessToken(): Promise<string> {
  const secret_id = Deno.env.get('GOCARDLESS_SECRET_ID')
  const secret_key = Deno.env.get('GOCARDLESS_SECRET_KEY')
  if (!secret_id || !secret_key) {
    throw new Error('Faltan GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY')
  }
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_id, secret_key }),
  })
  if (!res.ok) throw new Error(`GoCardless token error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.access as string
}

export async function gcFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GC_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GoCardless ${path} error: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

// Resuelve el id de institución a usar: variable de entorno explícita o
// autodetección de "Revolut" en el país indicado.
export async function resolveInstitutionId(token: string, country = 'es'): Promise<string> {
  const explicit = Deno.env.get('GOCARDLESS_INSTITUTION_ID')
  if (explicit) return explicit
  const list = await gcFetch(token, `/institutions/?country=${country}`)
  const revolut = (list as Array<{ id: string; name: string }>).find((i) =>
    i.name.toLowerCase().includes('revolut'))
  if (!revolut) throw new Error('No se encontró la institución Revolut para el país ' + country)
  return revolut.id
}
