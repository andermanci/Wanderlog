// Supabase Edge Function: audioguide-tts
// Sintetiza el guion de una parada de audioguía a MP3 con Google Cloud TTS
// y lo sube a Cloudflare R2. Devuelve la CLAVE del objeto, no una URL: quien
// la convierte en URL es el cliente, con VITE_R2_PUBLIC_URL (src/lib/mediaUrl.ts).
//
// AUTORIZACIÓN: reenvía el JWT del usuario, como revolut-sync. Pero ojo, aquí
// hay una diferencia importante respecto a cuando el audio vivía en Supabase
// Storage: allí la última palabra la tenían las políticas RLS del bucket, que
// exigían que el fichero colgara de la carpeta del propio usuario. En R2 no hay
// RLS. Esta función es el ÚNICO guardián, así que comprueba de verdad que la
// parada existe y que el usuario puede editar ese viaje, en vez de limitarse a
// mirar la forma de una ruta que además mandaba el propio cliente.
//
// Deploy: supabase functions deploy audioguide-tts
// Secretos: GOOGLE_TTS_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//           R2_SECRET_ACCESS_KEY, R2_BUCKET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bloqueoIA } from '../_shared/limits.ts'
import { registrarUso } from '../_shared/usage.ts'
import { clienteR2, configR2DelEntorno, r2Put } from '../_shared/r2.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_TTS_API_KEY = Deno.env.get('GOOGLE_TTS_API_KEY')
// Tope de caracteres por petición: el guion más largo que genera la app
// (nivel "exhaustiva", 450 palabras) no llega a 3.000.
const MAX_TTS_CHARS = 5000
// El mismo tope que ponía `file_size_limit` del bucket de Supabase (migración
// 027). En R2 no existe esa red, así que se pone aquí. Con MAX_TTS_CHARS a 32
// kbps no se llega ni a 1,5 MB: es holgura, no restricción.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

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

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- Frases y timepoints -----------------------------------------------
// Para el resaltado sincronizado del guion, cortamos el texto en frases e
// insertamos un <mark> SSML antes de cada una; Google TTS (v1beta1 con
// enableTimePointing) devuelve el instante exacto en que arranca cada mark.
// Mantener la segmentación en sync con src/lib/audioguide/sentences.ts.

const SENTENCE_BREAK =
  /(?<!\b(?:Sr|Sra|Srta|Dr|Dra|D|Dña|S|s|St|Sta|núm|nº|art|pág|aprox|etc)\.)(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡«"(])/
const MIN_SENTENCE_CHARS = 20

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const parts = normalized.split(SENTENCE_BREAK)
  const sentences: string[] = []
  for (const part of parts) {
    const prev = sentences[sentences.length - 1]
    if (prev !== undefined && (part.length < MIN_SENTENCE_CHARS || prev.length < MIN_SENTENCE_CHARS)) {
      sentences[sentences.length - 1] = `${prev} ${part}`
    } else {
      sentences.push(part)
    }
  }
  return sentences
}

function escapeSsml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildSsml(sentences: string[]): string {
  const body = sentences.map((s, i) => `<mark name="s${i}"/>${escapeSsml(s)}`).join(' ')
  return `<speak>${body}</speak>`
}

interface Timepoint { markName?: string; timeSeconds?: number }
interface SentenceTiming { text: string; start: number }

// Si falta el timepoint de alguna frase, devolvemos null: el cliente estima
// los tiempos, que es mejor que guardar timings a medias como si fueran buenos.
function buildTimings(sentences: string[], timepoints: Timepoint[] | undefined): SentenceTiming[] | null {
  if (!timepoints?.length) return null
  const byMark = new Map(timepoints.map((t) => [t.markName, t.timeSeconds]))
  const timings: SentenceTiming[] = []
  for (let i = 0; i < sentences.length; i++) {
    const seconds = byMark.get(`s${i}`)
    if (typeof seconds !== 'number') return null
    timings.push({ text: sentences[i], start: Math.max(0, Math.round(seconds * 100) / 100) })
  }
  return timings
}

// El MP3 que devuelve Google Cloud TTS es un stream "pelado": ni ID3 ni
// cabecera Xing/LAME con la duración. Chrome la calcula igualmente, pero
// Safari/iOS es mucho más estricto y a veces ni siquiera reproduce el
// audio sin esa cabecera. Le insertamos un frame Xing/Info válido (mismos
// parámetros MPEG que el resto del stream) delante del audio original, sin
// tocar ni un byte del audio real.
const V2_L3_BITRATES_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const V2_SAMPLE_RATES = [22050, 24000, 16000]

// El tipo de retorno se concreta a `Uint8Array<ArrayBuffer>` porque estos
// bytes acaban siendo el cuerpo de un fetch hacia R2, y el `Uint8Array`
// genérico admite también SharedArrayBuffer, que ahí no vale.
function addMp3XingHeader(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
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
    const cfgR2 = configR2DelEntorno()
    if (!cfgR2) return json({ error: 'Falta la configuración de R2' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    // Cada llamada a Google TTS se factura por carácter. `can_use_ai` no puede
    // aplicarse por RLS (no hay ninguna fila que insertar), así que se
    // comprueba aquí, que es por donde pasa de verdad el gasto.
    const bloqueo = await bloqueoIA(userClient, user.id)
    if (bloqueo) return json({ error: bloqueo }, 403)

    // `path` se acepta y se IGNORA: los bundles anteriores a la mudanza a R2 lo
    // siguen mandando, y durante un despliegue conviven los dos. La clave la
    // decide ahora el servidor. compat: se puede quitar a partir de 2026-10.
    const { stopId, text } = await req.json().catch(() => ({}))
    if (!stopId || !text) return json({ error: 'Faltan stopId o text' }, 400)
    // Google Cloud TTS se factura por carácter sintetizado. Sin este tope,
    // cualquiera con la anon key (que va en el bundle) podría sintetizar texto
    // ilimitado contra nuestra cuenta. Una parada larga ronda los 3.000.
    if (typeof text !== 'string' || text.length > MAX_TTS_CHARS) {
      return json({ error: `El texto supera el máximo de ${MAX_TTS_CHARS} caracteres` }, 400)
    }

    // Que la parada exista y sea visible ya lo decide `has_trip_access`, que es
    // la política de SELECT de la tabla: con el cliente del usuario, una parada
    // de un viaje ajeno sencillamente no aparece.
    const { data: stop } = await userClient
      .from('audioguide_stops')
      .select('id, trip_id, audio_url, audioguides!inner(activity_id, day_id)')
      .eq('id', stopId)
      .maybeSingle()
    if (!stop) return json({ error: 'Parada no encontrada' }, 404)

    // Ver no es editar: un colaborador con permiso de solo lectura llega hasta
    // aquí. `can_edit_trip` es la misma función que usan las políticas de
    // escritura de la tabla, así que la regla no se duplica, se reutiliza.
    const { data: puedeEditar } = await userClient.rpc('can_edit_trip', { p_trip_id: stop.trip_id })
    if (puedeEditar !== true) return json({ error: 'No autorizado' }, 403)

    // Regenerar una parada tiene que sobrescribir SU objeto, no crear uno nuevo:
    // si la generó otro miembro del viaje, su clave lleva el id de aquel, y
    // derivar una nueva con el id de quien regenera dejaría la anterior
    // huérfana para siempre. Solo se deriva clave cuando no hay ninguna (o
    // cuando la que hay es una URL de las antiguas, todavía en Supabase).
    // PostgREST devuelve la relación anidada como objeto cuando deduce que es
    // «muchos a uno» y como array cuando no lo deduce. Se aceptan las dos: que
    // la generación de audio dependa de esa inferencia sería frágil de más.
    const anidado = stop.audioguides as unknown
    const scope = (Array.isArray(anidado) ? anidado[0] : anidado) as
      { activity_id: string | null; day_id: string | null } | undefined
    const scopeId = scope?.activity_id ?? scope?.day_id
    if (!scopeId) return json({ error: 'La audioguía no tiene ámbito' }, 409)
    const claveExistente = typeof stop.audio_url === 'string' && !/^https?:/.test(stop.audio_url)
      ? stop.audio_url
      : null
    const key = claveExistente ?? `${user.id}/${stop.trip_id}/${scopeId}/${stop.id}.mp3`

    const voiceAndConfig = {
      voice: { languageCode: 'es-ES', name: 'es-ES-Neural2-B' },
      audioConfig: { audioEncoding: 'MP3' },
    }

    // Intento con timepoints: SSML con un <mark> por frase contra v1beta1.
    // El límite de 5000 de Google es en bytes UTF-8 e incluye las etiquetas,
    // así que si el SSML no cabe (o v1beta1 falla) caemos a la petición v1
    // de siempre con texto plano y sin timings.
    const sentences = splitSentences(text)
    const ssml = buildSsml(sentences)
    let audioContent: string | undefined
    let sentenceTimings: SentenceTiming[] | null = null

    if (sentences.length > 0 && new TextEncoder().encode(ssml).length <= 5000) {
      const betaRes = await fetch(
        `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { ssml },
            ...voiceAndConfig,
            enableTimePointing: ['SSML_MARK'],
          }),
        },
      )
      if (betaRes.ok) {
        const body = await betaRes.json()
        if (body.audioContent) {
          audioContent = body.audioContent
          sentenceTimings = buildTimings(sentences, body.timepoints)
        }
      }
    }

    if (!audioContent) {
      const ttsRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { text }, ...voiceAndConfig }),
        },
      )
      if (!ttsRes.ok) {
        return json({ error: `Google TTS error: ${ttsRes.status} ${await ttsRes.text()}` }, 502)
      }
      audioContent = (await ttsRes.json()).audioContent
      if (!audioContent) return json({ error: 'Google TTS no devolvió audio' }, 502)
    }

    const rawBytes = base64ToBytes(audioContent)
    // Lo que se SUBE lleva la cabecera Xing; lo que se MIDE es el MP3 crudo.
    // No es un descuido: sin ese frame Xing, Safari (Mac y iOS) no reproduce.
    // Si algún día alguien "simplifica" esto subiendo rawBytes, la app se queda
    // muda en todos los iPhone y el fallo no apunta hacia aquí.
    const bytes = addMp3XingHeader(rawBytes)
    if (bytes.length > MAX_AUDIO_BYTES) {
      return json({ error: 'El audio generado es demasiado grande' }, 413)
    }

    // El content-type lo fija el servidor y nunca se acepta del cliente: es lo
    // que hacía `allowed_mime_types` del bucket, que en R2 no existe.
    await r2Put(clienteR2(cfgR2), key, bytes, 'audio/mpeg')

    // Duración exacta calculada del propio MP3; si no se puede parsear, se
    // estima por nº de palabras (~150 palabras/min de narración).
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length
    const duration = mp3DurationSeconds(rawBytes) ?? Math.round((wordCount / 150) * 60)

    // Google TTS factura por CARÁCTER: esa es la unidad que hay que guardar,
    // no "una audioguía". Sin `await`: la respuesta no espera a la métrica.
    registrarUso(user.id, null, 'ai.audioguide_tts', {
      caracteres: text.length,
      frases: sentences.length,
      segundos: duration,
      bytes: bytes.length,
    })

    // `audioUrl` va con el MISMO valor que `audioKey` —la clave— y no con una
    // URL, para que el bundle anterior, que solo conoce ese nombre, siga
    // funcionando durante el despliegue: sabe guardarlo y sabe resolverlo,
    // porque mediaUrl() acepta las dos formas. compat: quitar a partir de
    // 2026-10, dejando solo audioKey.
    return json({
      stopId,
      audioKey: key,
      audioUrl: key,
      audioBytes: bytes.length,
      durationSeconds: duration,
      sentenceTimings,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
