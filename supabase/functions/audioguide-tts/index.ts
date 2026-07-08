// Supabase Edge Function: audioguide-tts
// Sintetiza el guion de una parada de audioguía a MP3 con Google Cloud TTS
// y lo sube al bucket 'audioguides'. No usa service role: reenvía el JWT del
// usuario para que las políticas RLS de la tabla y del storage sean las que
// autoricen (igual patrón que revolut-sync).
// Deploy: supabase functions deploy audioguide-tts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_TTS_API_KEY = Deno.env.get('GOOGLE_TTS_API_KEY')

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!GOOGLE_TTS_API_KEY) return json({ error: 'Falta GOOGLE_TTS_API_KEY' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { stopId, text, path } = await req.json().catch(() => ({}))
    if (!stopId || !text || !path) return json({ error: 'Faltan stopId, text o path' }, 400)
    if (!path.startsWith(`${user.id}/`)) return json({ error: 'Ruta no autorizada' }, 403)

    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'es-ES', name: 'es-ES-Neural2-B' },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      },
    )
    if (!ttsRes.ok) {
      return json({ error: `Google TTS error: ${ttsRes.status} ${await ttsRes.text()}` }, 502)
    }
    const { audioContent } = await ttsRes.json()
    if (!audioContent) return json({ error: 'Google TTS no devolvió audio' }, 502)

    const bytes = base64ToBytes(audioContent)
    const { error: uploadErr } = await userClient.storage
      .from('audioguides')
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) return json({ error: `Error subiendo audio: ${uploadErr.message}` }, 500)

    const { data: pub } = userClient.storage.from('audioguides').getPublicUrl(path)

    // Estimación simple de duración (~150 palabras/min de narración).
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const estimatedDuration = Math.round((wordCount / 150) * 60)

    return json({ stopId, audioUrl: pub.publicUrl, durationSeconds: estimatedDuration })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
