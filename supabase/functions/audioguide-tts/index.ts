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
// Tope de caracteres por petición: el guion más largo que genera la app
// (nivel "exhaustiva", 450 palabras) no llega a 3.000.
const MAX_TTS_CHARS = 5000

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

// El MP3 que devuelve Google Cloud TTS es un stream "pelado": ni ID3 ni
// cabecera Xing/LAME con la duración. Chrome la calcula igualmente, pero
// Safari/iOS es mucho más estricto y a veces ni siquiera reproduce el
// audio sin esa cabecera. Le insertamos un frame Xing/Info válido (mismos
// parámetros MPEG que el resto del stream) delante del audio original, sin
// tocar ni un byte del audio real.
const V2_L3_BITRATES_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const V2_SAMPLE_RATES = [22050, 24000, 16000]

function addMp3XingHeader(bytes: Uint8Array): Uint8Array {
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return bytes
    const versionBits = (bytes[1] >> 3) & 0x03
    const layerBits = (bytes[1] >> 1) & 0x03
    if (versionBits !== 0x02 || layerBits !== 0x01) return bytes // solo MPEG2 Layer III (lo que devuelve Google TTS)

    const bitrateIndex = (bytes[2] >> 4) & 0x0f
    const sampleRateIndex = (bytes[2] >> 2) & 0x03
    const padding = (bytes[2] >> 1) & 0x01
    const channelMode = (bytes[3] >> 6) & 0x03
    const bitrate = V2_L3_BITRATES_KBPS[bitrateIndex] * 1000
    const sampleRate = V2_SAMPLE_RATES[sampleRateIndex]
    if (!bitrate || !sampleRate) return bytes

    const frameSize = Math.floor((72 * bitrate) / sampleRate) + padding
    const sideInfoSize = channelMode === 0x03 ? 9 : 17 // mono vs resto, MPEG2/2.5
    const tagOffset = 4 + sideInfoSize
    if (frameSize < tagOffset + 16) return bytes

    const totalOriginalFrames = Math.floor(bytes.length / frameSize)
    const frame = new Uint8Array(frameSize)
    frame.set(bytes.subarray(0, 4), 0)
    frame[tagOffset] = 0x49 // 'I'
    frame[tagOffset + 1] = 0x6e // 'n'
    frame[tagOffset + 2] = 0x66 // 'f'
    frame[tagOffset + 3] = 0x6f // 'o'
    const dv = new DataView(frame.buffer)
    dv.setUint32(tagOffset + 4, 0x00000003) // flags: nº de frames + nº de bytes presentes
    dv.setUint32(tagOffset + 8, totalOriginalFrames + 1)
    dv.setUint32(tagOffset + 12, frameSize + bytes.length)

    const out = new Uint8Array(frame.length + bytes.length)
    out.set(frame, 0)
    out.set(bytes, frame.length)
    return out
  } catch {
    return bytes // ante cualquier duda, servimos el audio tal cual
  }
}

// Duración exacta a partir del propio frame MPEG (576 muestras/frame en
// Layer III MPEG2), en vez de estimarla por nº de palabras.
function mp3DurationSeconds(bytes: Uint8Array): number | null {
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return null
    const bitrateIndex = (bytes[2] >> 4) & 0x0f
    const sampleRateIndex = (bytes[2] >> 2) & 0x03
    const padding = (bytes[2] >> 1) & 0x01
    const bitrate = V2_L3_BITRATES_KBPS[bitrateIndex] * 1000
    const sampleRate = V2_SAMPLE_RATES[sampleRateIndex]
    if (!bitrate || !sampleRate) return null
    const frameSize = Math.floor((72 * bitrate) / sampleRate) + padding
    const totalFrames = Math.floor(bytes.length / frameSize)
    return Math.round((totalFrames * 576) / sampleRate)
  } catch {
    return null
  }
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
    // Google Cloud TTS se factura por carácter sintetizado. Sin este tope,
    // cualquiera con la anon key (que va en el bundle) podría sintetizar texto
    // ilimitado contra nuestra cuenta. Una parada larga ronda los 3.000.
    if (typeof text !== 'string' || text.length > MAX_TTS_CHARS) {
      return json({ error: `El texto supera el máximo de ${MAX_TTS_CHARS} caracteres` }, 400)
    }

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

    const rawBytes = base64ToBytes(audioContent)
    const bytes = addMp3XingHeader(rawBytes)
    const { error: uploadErr } = await userClient.storage
      .from('audioguides')
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) return json({ error: `Error subiendo audio: ${uploadErr.message}` }, 500)

    const { data: pub } = userClient.storage.from('audioguides').getPublicUrl(path)

    // Duración exacta calculada del propio MP3; si no se puede parsear, se
    // estima por nº de palabras (~150 palabras/min de narración).
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const duration = mp3DurationSeconds(rawBytes) ?? Math.round((wordCount / 150) * 60)

    return json({ stopId, audioUrl: pub.publicUrl, durationSeconds: duration })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
