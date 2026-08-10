// Validación del evento que llega a `/api/track`.
//
// Es el único endpoint que escribe SIN sesión, y tiene que serlo: si exigiera
// login solo se mediría a quien ya entró, o sea a nadie de los que se quieren
// medir. Así que todo lo que llega por aquí se trata como hostil.
//
// La regla: **nunca se arregla un cuerpo raro, se descarta**. Arreglarlo es
// aceptar algo que no se entiende, y aquí el coste de descartar es una visita
// menos en una estadística.
//
// Puro y sin dependencias, ni el alias `@/`: lo importa la edge function de
// Deno por ruta relativa.

import { normalizarRuta, seccionDe } from './sections.ts'

export type Dispositivo = 'movil' | 'tablet' | 'escritorio' | 'pwa' | 'desconocido'

export interface Evento {
  id: string
  sessionId: string
  path: string
  section: string
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  device: Dispositivo
  ms: number | null
  /** `true` = beacon de cierre (sobrescribe); `false` = apertura (no pisa). */
  cierre: boolean
}

/**
 * Tope duro del cuerpo. Un evento legítimo son ~300 bytes, pero aquí viaja
 * también el JWT (`sendBeacon` no permite cabeceras, así que no cabe en
 * Authorization), y un token de Supabase ronda los 800-1200 caracteres.
 */
export const MAX_CUERPO = 4096

/**
 * Tope de duración: media hora. Por encima es una pestaña olvidada o una
 * mentira, y en los dos casos no es tiempo de lectura. Se recorta en vez de
 * descartar: la vista ocurrió, lo que no vale es el número.
 */
export const MAX_MS = 30 * 60_000

const MAX_TEXTO = 64
const MAX_TOKEN = 4000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Bots que se identifican. Solo para a los honestos —quien quiera colarse pone
 * un user-agent de Chrome—, pero son la inmensa mayoría del ruido: sin esto,
 * buena parte de las «visitas» a la pantalla de invitación serían los
 * previsualizadores de enlaces de WhatsApp y Telegram.
 */
export function esBot(ua: string | null | undefined): boolean {
  if (!ua) return true   // un navegador siempre manda user-agent
  return /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python-requests|axios|fetch\//i.test(ua)
}

/**
 * `standalone` lo manda el cliente (`display-mode: standalone`), porque el
 * user-agent de una PWA instalada es idéntico al del navegador. Se mira
 * PRIMERO por la misma razón por la que en el proyecto hermano se miraba
 * Electron antes que escritorio: si no, el único dato que dice cuánta gente
 * usa Wanderlog como aplicación instalada se pierde entre «movil».
 */
export function dispositivoDe(
  ua: string | null | undefined,
  standalone?: boolean,
): Dispositivo {
  if (standalone) return 'pwa'
  if (!ua) return 'desconocido'
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile/i.test(ua)) return 'movil'
  if (/mozilla|chrome|safari|firefox|edg/i.test(ua)) return 'escritorio'
  return 'desconocido'
}

/** El host de una URL, o null. Nunca la URL entera. */
export function hostDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, MAX_TEXTO)
  return t || null
}

/**
 * Valida y recorta el cuerpo.
 *
 * Devuelve el evento Y EL TOKEN POR SEPARADO, nunca dentro del evento. No es
 * disciplina: es que la función que escribe en la base recibe el evento y no
 * el token, así que es imposible que un JWT acabe en una columna por descuido.
 *
 * `propioHost` sirve para descartar el referer interno: llegar al itinerario
 * desde el resumen del viaje no es una «procedencia», y contarlo llenaría la
 * tabla con el propio dominio.
 */
export function parseEvento(
  crudo: string,
  ctx: { userAgent: string | null; propioHost: string | null },
): { evento: Evento; token: string | null } | null {
  if (crudo.length > MAX_CUERPO) return null

  let obj: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(crudo)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    obj = parsed as Record<string, unknown>
  } catch {
    return null
  }

  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!UUID.test(id)) return null

  const sessionId = typeof obj.sid === 'string' ? obj.sid : ''
  if (!UUID.test(sessionId)) return null

  const path = normalizarRuta(obj.path)
  if (!path) return null

  let ms: number | null = null
  if (obj.ms != null) {
    const n = Number(obj.ms)
    if (!Number.isFinite(n) || n < 0) return null
    ms = Math.min(Math.round(n), MAX_MS)
  }

  const refHost = hostDe(texto(obj.ref))
  const token = typeof obj.t === 'string' && obj.t.length <= MAX_TOKEN ? obj.t : null

  // Los campos de sobra se ignoran: el objeto se construye campo a campo,
  // nunca con un spread de lo que llegó.
  return {
    token,
    evento: {
      id,
      sessionId,
      path,
      section: seccionDe(path),
      referrerHost: refHost && refHost !== ctx.propioHost ? refHost : null,
      utmSource: texto(obj.us),
      utmMedium: texto(obj.um),
      utmCampaign: texto(obj.uc),
      device: dispositivoDe(ctx.userAgent, obj.pwa === true),
      ms,
      cierre: obj.fin === true,
    },
  }
}
