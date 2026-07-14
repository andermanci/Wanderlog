// Supabase Edge Function: place-photo
// Copia UNA VEZ la foto de un lugar de Google al bucket 'attachments' y
// devuelve su URL pública. Guardar la URL de Google directamente en la BD
// sale caro: ese enlace apunta al endpoint de Places Photo, así que cada
// render de la portada era una petición facturada (y exponía la API key).
// Tiene que ser servidor: el navegador no puede leer los bytes de la imagen
// de Google (CORS), y la key del navegador está restringida por referrer.
// No usa service role: reenvía el JWT del usuario para que las políticas RLS
// del storage sean las que autoricen (mismo patrón que audioguide-tts).
// Deploy: supabase functions deploy place-photo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// Key usable desde servidor (sin restricción de referrer) con la Places API
// activada. Si no hay una dedicada, se reutiliza la de TTS.
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_SERVER_KEY') ?? Deno.env.get('GOOGLE_TTS_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_HOSTS = ['places.googleapis.com', 'maps.googleapis.com']
// Los mismos que acepta el bucket 'attachments' (migración 006).
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!GOOGLE_API_KEY) return json({ error: 'Falta GOOGLE_MAPS_SERVER_KEY' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { photoUri, path } = await req.json().catch(() => ({}))
    if (!photoUri || !path) return json({ error: 'Faltan photoUri o path' }, 400)
    if (!path.startsWith(`${user.id}/`)) return json({ error: 'Ruta no autorizada' }, 403)

    let url: URL
    try {
      url = new URL(photoUri)
    } catch {
      return json({ error: 'photoUri no es una URL válida' }, 400)
    }
    if (!ALLOWED_HOSTS.includes(url.hostname)) {
      return json({ error: `Host no permitido: ${url.hostname}` }, 400)
    }
    // La key que venía en la URL es la del navegador (restringida por referrer):
    // desde aquí daría 403, así que la cambiamos por la de servidor.
    url.searchParams.set('key', GOOGLE_API_KEY)

    const photoRes = await fetch(url.toString())
    if (!photoRes.ok) {
      return json({ error: `Google Places Photo: ${photoRes.status} ${await photoRes.text()}` }, 502)
    }
    const contentType = (photoRes.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!ALLOWED_TYPES.includes(contentType)) {
      return json({ error: `Tipo de imagen no soportado: ${contentType || 'desconocido'}` }, 415)
    }
    const bytes = new Uint8Array(await photoRes.arrayBuffer())

    const { error: uploadErr } = await userClient.storage
      .from('attachments')
      .upload(path, bytes, { contentType, upsert: true })
    if (uploadErr) return json({ error: `Error subiendo la foto: ${uploadErr.message}` }, 500)

    const { data: pub } = userClient.storage.from('attachments').getPublicUrl(path)
    return json({ url: pub.publicUrl })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
