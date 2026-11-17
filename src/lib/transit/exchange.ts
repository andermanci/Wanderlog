import { z } from 'zod'
import { isMove, pairKey, transitSig, type TravelLeg } from '@/lib/travelTime'
import type { PendingLeg } from '@/lib/queries/travelTime'
import type { Activity, TransitStep } from '@/types/database'

// Transporte público por copia y pega, como las audioguías y las propuestas
// de Claude: la app arma un prompt con los trayectos en coche, el usuario lo
// pega en su IA (Claude, ChatGPT…) y devuelve la respuesta, que aquí se valida
// y se convierte en filas de transit_routes. No se llama a ninguna API.

export class TransitImportError extends Error {}

export interface TransitLegInput {
  leg: PendingLeg
  from: Activity
  to: Activity
  drive?: TravelLeg
}

export interface TransitRow {
  from_activity_id: string
  to_activity_id: string
  coords_sig: string
  worth_it: boolean
  total_minutes: number | null
  summary: string | null
  fare_text: string | null
  note: string | null
  steps: TransitStep[]
}

export interface TransitParseResult {
  rows: TransitRow[]
  warnings: string[]
}

export const refFor = (i: number) => `T${i + 1}`

// Cómo se describe cada extremo: nombre, dirección y coordenadas. Si es un
// transporte o un vuelo, cuenta el sitio donde llega (o de donde sale).
function describe(a: Activity, p: { lat: number; lng: number }, side: 'from' | 'to'): string {
  const place = isMove(a) ? (side === 'from' ? a.destination : a.origin) : null
  const name = place ? `${place} (${side === 'from' ? 'llegada de' : 'salida de'} «${a.title}»)` : a.title
  const addr = !isMove(a) && a.address ? `, ${a.address}` : ''
  return `${name}${addr} [${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}]`
}

export function buildTransitPrompt(tripLabel: string, legs: TransitLegInput[], opts: { asFile?: boolean } = {}): string {
  const list = legs.map(({ leg, from, to, drive }, i) => {
    const km = drive ? drive.distanceMeters / 1000 : null
    const extra = [
      km != null ? `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : null,
      drive ? `${Math.round(drive.durationSeconds / 60)} min en coche` : null,
    ].filter(Boolean).join(', ')
    return `${refFor(i)}. DESDE ${describe(from, leg.origin, 'from')}\n    HASTA ${describe(to, leg.destination, 'to')}${extra ? `\n    (${extra})` : ''}`
  }).join('\n')

  return `Eres un experto en transporte público local. Viaje: ${tripLabel}.
Para cada trayecto de la lista dime cómo hacerlo en transporte público (metro, tren, tranvía, bus, ferry), como lo recomendaría alguien que vive allí. No es tiempo real: es para planificar el viaje.

Reglas:
- Usa solo líneas y estaciones que EXISTEN de verdad, con su nombre oficial. Si dudas de alguna, no la inventes: dilo en "consejo".
- En Japón, estaciones en romaji con el kanji entre paréntesis: "Shibuya (渋谷)". Líneas como aparecen en los carteles: "Ginza Line (G)", "JR Yamanote Line".
- Elige la combinación más sencilla, con pocos transbordos. Si el último tramo se hace mejor andando, súmalo a "a_pie_hasta_destino" en vez de añadir otro vehículo.
- "compensa": false si se va casi todo andando, si no hay una línea útil o si tarda más del doble que el coche sin ventaja clara. Entonces deja "tramos" vacío y explica el motivo en "consejo".
- "sube", "baja" y "linea" llevan SOLO el nombre, sin comentarios.
- "color": el color oficial de la línea en hex (#RRGGBB), o null si no lo sabes seguro.
- "transbordo_a_pie": minutos andando de transbordo ANTES de subir a ese tramo (0 en el primero).
- "total_minutos": puerta a puerta, con los tramos a pie y una espera razonable.
- "precio": aproximado por persona en moneda local ("≈ 210 ¥"); di si lo cubre el JR Pass cuando aplique. null si no lo sabes.
- "consejo": breve, en español (qué salida usar, andén, alternativa a pie…). null si no hay nada.

${opts.asFile
    ? 'Devuélveme la respuesta como un ARCHIVO descargable llamado "transporte-publico.json" (no la escribas en el chat), con este formato, un elemento por trayecto, con su "ref":'
    : 'Responde SOLO con un bloque ```json con este formato, un elemento por trayecto, con su "ref":'}

\`\`\`json
{
  "trayectos": [
    {
      "ref": "T1",
      "compensa": true,
      "a_pie_hasta_estacion": 5,
      "tramos": [
        {
          "tipo": "metro",
          "linea": "Ginza Line (G)",
          "operador": "Tokyo Metro",
          "sube": "Asakusa (浅草)",
          "baja": "Shibuya (渋谷)",
          "paradas": 18,
          "minutos": 33,
          "direccion": "Shibuya",
          "color": "#FF9500",
          "transbordo_a_pie": 0
        }
      ],
      "a_pie_hasta_destino": 3,
      "total_minutos": 45,
      "resumen": "Ginza Line",
      "precio": "≈ 250 ¥",
      "consejo": "Sal por la salida Hachikō."
    }
  ]
}
\`\`\`

"tipo" es uno de: metro, train, bus, tram, ferry.

Trayectos:
${list}`
}

const num = z.number().nullish().catch(null)
const str = z.string().nullish().catch(null)
const Ride = z.object({
  tipo: str, linea: str, operador: str, sube: str, baja: str,
  paradas: num, minutos: num, direccion: str, color: str, transbordo_a_pie: num,
})
const Item = z.object({
  ref: z.string(),
  compensa: z.boolean().catch(false),
  a_pie_hasta_estacion: num,
  tramos: z.array(Ride).nullish().catch([]),
  a_pie_hasta_destino: num,
  total_minutos: num,
  resumen: str, precio: str, consejo: str,
})
const Response = z.object({ trayectos: z.array(Item) })

const RIDE_KINDS = ['metro', 'train', 'bus', 'tram', 'ferry']

/** Saca el JSON de la respuesta: el bloque ```json con "trayectos", o el texto entero. */
export function extractTransitJson(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1])
  const candidates = [
    ...blocks.filter(b => b.includes('"trayectos"')),
    text.trim(),
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ]
  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (v && typeof v === 'object' && 'trayectos' in v) return v
    } catch { /* siguiente candidato */ }
  }
  throw new TransitImportError('No encuentro los trayectos en el texto. Pega la respuesta entera (con el bloque ```json).')
}

const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim().slice(0, 300) : null)
const mins = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null)

function walk(minutes: number | null): TransitStep {
  return { kind: 'walk', line: null, operator: null, line_color: null, from_station: null, to_station: null, stops: null, minutes, direction: null }
}

export function parseTransitResponse(text: string, legs: TransitLegInput[]): TransitParseResult {
  const parsed = Response.safeParse(extractTransitJson(text))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new TransitImportError(`La respuesta no tiene el formato esperado (${issue?.path.join('.') || 'raíz'}: ${issue?.message}).`)
  }
  const byRef = new Map(legs.map((l, i) => [refFor(i), l]))
  const warnings: string[] = []
  const seen = new Set<string>()
  const rows: TransitRow[] = []

  for (const t of parsed.data.trayectos) {
    const ref = t.ref.trim().toUpperCase()
    const input = byRef.get(ref)
    if (!input) { warnings.push(`«${t.ref}» no es ningún trayecto del prompt: se ignora.`); continue }
    if (seen.has(ref)) continue
    seen.add(ref)

    const steps: TransitStep[] = []
    const rides = (t.tramos ?? []).filter(r => clean(r.linea) || clean(r.sube) || clean(r.baja)).slice(0, 8)
    if (rides.length > 0) {
      if (mins(t.a_pie_hasta_estacion)) steps.push(walk(mins(t.a_pie_hasta_estacion)))
      rides.forEach((r, i) => {
        if (i > 0 && mins(r.transbordo_a_pie)) steps.push(walk(mins(r.transbordo_a_pie)))
        const color = clean(r.color)
        steps.push({
          kind: (RIDE_KINDS.includes(String(r.tipo)) ? r.tipo : 'other') as TransitStep['kind'],
          line: clean(r.linea),
          operator: clean(r.operador),
          line_color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : null,
          from_station: clean(r.sube),
          to_station: clean(r.baja),
          stops: typeof r.paradas === 'number' && r.paradas >= 0 ? Math.round(r.paradas) : null,
          minutes: mins(r.minutos),
          direction: clean(r.direccion),
        })
      })
      if (mins(t.a_pie_hasta_destino)) steps.push(walk(mins(t.a_pie_hasta_destino)))
    }
    const worth = t.compensa && rides.length > 0
    rows.push({
      from_activity_id: input.leg.fromId,
      to_activity_id: input.leg.toId,
      coords_sig: transitSig(input.leg.origin, input.leg.destination),
      worth_it: worth,
      total_minutes: mins(t.total_minutos),
      summary: clean(t.resumen) ?? (rides.length ? rides.map(r => clean(r.linea)).filter(Boolean).join(' → ') : null),
      fare_text: clean(t.precio),
      note: clean(t.consejo),
      steps: worth ? steps : [],
    })
  }

  const missing = legs.map((_, i) => refFor(i)).filter(r => !seen.has(r))
  if (missing.length) warnings.push(`Sin respuesta para ${missing.join(', ')}: puedes volver a pedirlos luego.`)
  if (rows.length === 0) throw new TransitImportError('La respuesta no trae ningún trayecto de la lista.')
  return { rows, warnings }
}

export const legKey = (l: PendingLeg) => pairKey(l.fromId, l.toId)
