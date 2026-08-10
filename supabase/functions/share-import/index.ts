// Supabase Edge Function: share-import
// Recibe un enlace compartido (TikTok / Instagram / web) y devuelve el sitio del
// que habla: { placeName, city, country, category, why, thumbnailUrl }.
//
// Dos pasos, ambos gratis:
//   1. Sacar el TEXTO del vídeo/post: TikTok vía su oEmbed público; el resto
//      leyendo las etiquetas Open Graph del HTML. Instagram suele tapar el HTML
//      con un muro de login desde IP de servidor -> se marca needsManualText y
//      el cliente pide al usuario que pegue el caption a mano.
//   2. "Entender" ese texto con Gemini (capa gratuita de Google AI Studio),
//      que extrae el sitio en JSON estructurado.
//
// Tiene que ser servidor: el navegador no puede hacer fetch cross-origin a
// TikTok/Instagram (CORS) y la API key de Gemini no puede ir en el bundle.
// No usa service role: reenvía el JWT del usuario y verifica que esté logueado,
// para que nadie ajeno gaste la cuota de Gemini (mismo patrón que place-photo).
// Deploy: supabase functions deploy share-import
//   secreto: supabase secrets set GEMINI_API_KEY=...  (gratis en aistudio.google.com)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bloqueoIA } from '../_shared/limits.ts'
import { registrarUso } from '../_shared/usage.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// Key de la Generative Language API (Gemini). Si no hay una dedicada, se
// reutiliza la de TTS (es una API key de Google; basta con habilitarle la API).
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_TTS_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// User-Agent de navegador: muchas webs (y las OG de Instagram) devuelven algo
// distinto —o nada— a un cliente sin UA "de verdad".
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

const CATEGORIES = ['restaurant', 'hotel', 'attraction', 'cafe', 'bar', 'shop', 'other']
const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// La portada se manda a Gemini en base64: se limita para no inflar la petición.
const MAX_IMG_BYTES = 4 * 1024 * 1024

// Base64 de un Uint8Array por trozos (evita el "Maximum call stack" de
// String.fromCharCode(...todo) con imágenes grandes).
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// Descarga la portada (miniatura del vídeo / og:image) para pasársela a Gemini,
// que así puede LEER el texto sobreimpreso (muchos vídeos ponen ahí el nombre y
// la ubicación del sitio). Devuelve null si no es una imagen válida o pesa mucho.
async function fetchImageInline(u: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const r = await fetch(u, { headers: BROWSER_HEADERS })
    if (!r.ok) return null
    const mimeType = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!ALLOWED_IMG_TYPES.includes(mimeType)) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMG_BYTES) return null
    return { data: toBase64(bytes), mimeType }
  } catch {
    return null
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Platform = 'tiktok' | 'instagram' | 'web'

function detectPlatform(u: string): Platform {
  try {
    const h = new URL(u).hostname.replace(/^www\./, '')
    if (/(^|\.)tiktok\.com$/.test(h) || h === 'vm.tiktok.com' || h === 'vt.tiktok.com') return 'tiktok'
    if (/(^|\.)instagram\.com$/.test(h) || h === 'instagr.am') return 'instagram'
  } catch { /* url inválida: se trata como web genérica */ }
  return 'web'
}

// Extrae una etiqueta <meta property="og:x"> o <meta name="x"> del HTML.
function metaTag(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeEntities(m[1].trim())
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

// Decodifica una cadena tal cual aparece dentro del JSON embebido de TikTok
// (con \uXXXX, \n, etc.). Devuelve '' si no se puede.
function jsonStr(raw: string): string {
  try { return JSON.parse(`"${raw}"`) } catch { return '' }
}

// De la página de TikTok saca la descripción COMPLETA y, si el creador etiquetó
// el sitio, su ubicación (POI: nombre/ciudad/dirección). Es mucho más que el
// título del oEmbed, que a menudo se queda solo en la ciudad y un par de hashtags.
function tiktokExtras(html: string): string {
  const parts: string[] = []
  const ogd = metaTag(html, 'og:description')
  if (ogd) parts.push(ogd)
  const descTxt = jsonStr(html.match(/"desc":"([^"]{0,400})"/)?.[1] ?? '')
  if (descTxt && descTxt !== ogd) parts.push(descTxt)
  const poi = jsonStr(html.match(/"poiName":"([^"]{0,120})"/)?.[1] ?? '')
  const city = jsonStr(html.match(/"cityName":"([^"]{0,80})"/)?.[1] ?? '')
  const addr = jsonStr(html.match(/"(?:poiAddress|address)":"([^"]{0,160})"/)?.[1] ?? '')
  if (poi) parts.push(`Local etiquetado: ${poi}${city ? `, ${city}` : ''}${addr ? ` (${addr})` : ''}`)
  return parts.filter(Boolean).join('. ')
}

// Pide a Gemini que saque el sitio del texto (y de la portada, si la hay), en
// JSON con forma fija.
async function extractPlace(sourceText: string, image: { data: string; mimeType: string } | null): Promise<Record<string, unknown>> {
  const prompt = `Eres un asistente de viajes. A partir del texto de un vídeo/post de redes sociales${image ? ' y de su imagen de portada' : ''}, identifica EL sitio concreto (restaurante, hotel, café, bar, atracción, tienda) del que habla, para poder buscarlo luego en Google Maps.

El texto puede traer hashtags, la descripción del vídeo y una "Local etiquetado: …" con la ubicación que puso el autor. Prioriza SIEMPRE el nombre propio del local por encima de la ciudad.${image ? '\nEn la imagen de portada, LEE cualquier texto o rótulo sobreimpreso (nombre del local, 📍 ubicación, ciudad): a menudo el nombre solo aparece ahí.' : ''}

Reglas:
- "placeName": el nombre propio del sitio tal cual se buscaría en Google Maps (sin emojis ni hashtags). NO uses el nombre de la ciudad como placeName. Si aparece un "Local etiquetado", ese es casi siempre el sitio. Si NO hay un local concreto y buscable (solo la ciudad/zona), devuelve placeName = null.
- "city" y "country": la ciudad y el país donde está el sitio, si se deducen; si no, null.
- "category": una de ${CATEGORIES.join(', ')}.
- "why": una frase corta (máx. 12 palabras, en español) de por qué merece la pena, para recordarlo. Si no hay info, null.

Texto (puede estar casi vacío):
"""
${sourceText.slice(0, 4000)}
"""`

  const parts: unknown[] = []
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } })
  parts.push({ text: prompt })

  // Alias "…-latest": apunta siempre al flash vigente, así no hay que cambiar el
  // modelo cada vez que Google depreca una versión (los gemini-2.x ya dan 404
  // "no longer available to new users" en proyectos nuevos).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        // Es un modelo "thinking": los tokens de razonamiento cuentan aquí, así
        // que con un tope bajo (p. ej. 512) devuelve vacío. Se deja holgado; la
        // entrada va recortada a 4000 chars y la clave es de capa gratuita.
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            placeName: { type: 'STRING', nullable: true },
            city: { type: 'STRING', nullable: true },
            country: { type: 'STRING', nullable: true },
            category: { type: 'STRING', enum: CATEGORIES },
            why: { type: 'STRING', nullable: true },
          },
          required: ['placeName', 'category'],
        },
      },
    }),
  }

  // El modelo gratuito a veces responde 503 "high demand" (o 429/500): son picos
  // temporales, así que se reintenta con una espera creciente antes de rendirse.
  const TRANSIENT = new Set([429, 500, 503])
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, init)
    if (res.ok || !TRANSIENT.has(res.status)) break
    await res.body?.cancel().catch(() => {})
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
  }
  if (!res || !res.ok) {
    // Saturación tras varios intentos: señal para que el cliente ofrezca reintentar.
    if (res && TRANSIENT.has(res.status)) throw new Error('AI_BUSY')
    throw new Error(`Gemini: ${res?.status ?? 0} ${res ? await res.text() : ''}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini no devolvió contenido')
  return JSON.parse(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!GEMINI_API_KEY) return json({ error: 'Falta GEMINI_API_KEY' }, 500)

    // Verifica que sea un usuario logueado (evita que gasten la cuota de Gemini).
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    // Cada importación consume cuota de Gemini. `can_use_ai` no puede
    // aplicarse por RLS (no hay ninguna fila que insertar): se comprueba aquí.
    const bloqueo = await bloqueoIA(userClient, user.id)
    if (bloqueo) return json({ error: bloqueo }, 403)

    const { url, manualText } = await req.json().catch(() => ({}))
    if (!url && !manualText) return json({ error: 'Falta url o manualText' }, 400)

    const platform = url ? detectPlatform(String(url)) : 'web'
    let sourceText = typeof manualText === 'string' ? manualText.trim() : ''
    let thumbnailUrl: string | null = null
    let needsManualText = false

    // Solo se hace fetch del enlace si el usuario no pegó ya el texto a mano.
    if (!sourceText && url) {
      try { new URL(String(url)) } catch { return json({ error: 'La URL no es válida' }, 400) }

      // Sigue redirecciones (los enlaces cortos vm.tiktok.com/… llevan al real).
      const pre = await fetch(String(url), { redirect: 'follow', headers: BROWSER_HEADERS })
      const finalUrl = pre.url || String(url)

      if (platform === 'tiktok') {
        // La página trae la descripción completa y la ubicación etiquetada (POI).
        const html = await pre.text().catch(() => '')
        const extras = tiktokExtras(html)
        thumbnailUrl = metaTag(html, 'og:image')
        // oEmbed como complemento fiable (por si la página viene capada por
        // bot-check desde la IP del servidor): aporta título y miniatura.
        try {
          const oe = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(finalUrl)}`, { headers: BROWSER_HEADERS })
          if (oe.ok) {
            const j = await oe.json()
            const oeTitle = [j.title, j.author_name && `(por ${j.author_name})`].filter(Boolean).join(' ')
            sourceText = [oeTitle, extras].filter(Boolean).join('. ')
            thumbnailUrl = thumbnailUrl ?? j.thumbnail_url ?? null
          } else {
            sourceText = extras
          }
        } catch {
          sourceText = extras
        }
      } else {
        const html = await pre.text()
        const title = metaTag(html, 'og:title') ?? metaTag(html, 'twitter:title')
        const desc = metaTag(html, 'og:description') ?? metaTag(html, 'description')
        thumbnailUrl = metaTag(html, 'og:image') ?? metaTag(html, 'twitter:image')
        sourceText = [title, desc].filter(Boolean).join('. ')
        // Instagram sin sesión responde el muro de login: no hay caption útil.
        if (platform === 'instagram' && !desc) needsManualText = true
      }
    }

    // La portada se le pasa a Gemini para que lea rótulos sobreimpresos (a
    // menudo el nombre del sitio solo aparece ahí, no en el caption).
    const image = thumbnailUrl ? await fetchImageInline(thumbnailUrl) : null

    if (!sourceText && !image) {
      return json({ platform, needsManualText: true, thumbnailUrl, placeName: null })
    }

    let place: Record<string, unknown>
    try {
      place = await extractPlace(sourceText, image)
    } catch (e) {
      // Saturación de la IA: se responde 200 con un mensaje claro (y retriable)
      // para que el cliente muestre "Reintentar" en vez de un error crudo.
      if (e instanceof Error && e.message === 'AI_BUSY') {
        return json({ error: 'La IA está saturada ahora mismo (mucha demanda). Espera unos segundos y vuelve a intentarlo.', retriable: true }, 200)
      }
      throw e
    }
    // Solo se sugiere pegar el texto a mano si de verdad no salió un sitio y no
    // había texto legible (típico de Instagram con muro de login).
    registrarUso(user.id, null, 'ai.import', {
      plataforma: platform,
      conImagen: !!image,
      acerto: !!place.placeName,
    })

    return json({ ...place, platform, needsManualText: needsManualText && !place.placeName, thumbnailUrl, sourceText })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
