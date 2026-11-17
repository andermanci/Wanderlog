import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { haversineKm, isMove, pairKey, transitSig, type GeoPoint, type TravelLeg } from '@/lib/travelTime'
import type { PendingLeg } from '@/lib/queries/travelTime'
import type { Activity, TransitAlternative, TransitRoute, TransitSkipReason, TransitStep } from '@/types/database'

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
  /** Lo que se propuso antes para este trayecto, cuando se está corrigiendo. */
  previous?: string
  /** Fecha del día (yyyy-MM-dd): con las horas de las actividades, cuándo se hace. */
  date?: string
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)

// "martes 25 de noviembre de 2026, saliendo hacia las 22:00 (al acabar
// «Kabukicho»), para llegar a las 23:00". La salida es cuando acaba la
// actividad anterior (o "después de" su hora de inicio si no tiene fin); la
// llegada, cuando empieza la siguiente. Los hoteles no cuentan: su hora es la
// del check-in, no la de salir o llegar ese día.
export function whenText(input: TransitLegInput): string | null {
  const { from, to, date } = input
  const day = date ? format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es }) : null
  const leave = from.type === 'hotel' ? null
    : from.end_time ? `saliendo hacia las ${hhmm(from.end_time)} (al acabar «${from.title}»)`
      : from.start_time ? `después de las ${hhmm(from.start_time)}`
        : null
  const arrive = to.type !== 'hotel' && to.start_time ? `para llegar a las ${hhmm(to.start_time)}` : null
  const parts = [day, leave, arrive].filter(Boolean)
  return parts.length ? parts.join(', ') : null
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
  skip_reason: TransitSkipReason | null
  alternative: TransitAlternative | null
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
  const list = legs.map((input, i) => {
    const { leg, from, to, drive, previous } = input
    const km = drive ? drive.distanceMeters / 1000 : null
    const extra = [
      km != null ? `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : null,
      drive ? `${Math.round(drive.durationSeconds / 60)} min en coche` : null,
    ].filter(Boolean).join(', ')
    const prev = previous ? `\n    Antes se propuso: ${previous}. Al viajero no le cuadra con Google Maps: compruébalo de cero y corrígelo.` : ''
    const when = whenText(input)
    return `${refFor(i)}. DESDE ${describe(from, leg.origin, 'from')}\n    HASTA ${describe(to, leg.destination, 'to')}${when ? `\n    CUÁNDO: ${when}` : ''}${extra ? `\n    (${extra})` : ''}${prev}`
  }).join('\n')

  return `Eres un experto en transporte público local. Viaje: ${tripLabel}.
Para cada trayecto de la lista dime cómo hacerlo en transporte público (metro, tren, tranvía, bus, ferry), como lo recomendaría alguien que vive allí. No es tiempo real: es para planificar el viaje.

Si puedes consultar Google Maps (o buscar en la web), úsalo para comprobar cada trayecto: la ruta en transporte público que propone, las estaciones, las salidas y los minutos a pie. Si no puedes, hazlo con lo que sabes, pero no digas que lo has comprobado.

Cada trayecto lleva CUÁNDO se hace (día y hora aproximada). Tenlo en cuenta: frecuencia a esa hora, horario de fin de semana o festivo, último tren de la noche, buses que pasan pocas veces al día. Si a esa hora no hay servicio o casi no hay, dilo.

Reglas:
- Usa solo líneas y estaciones que EXISTEN de verdad, con su nombre oficial. Si dudas de alguna, no la inventes: dilo en "consejo".
- En Japón, estaciones en romaji con el kanji entre paréntesis: "Shibuya (渋谷)". Líneas como aparecen en los carteles: "Ginza Line (G)", "JR Yamanote Line".
- Elige la estación MÁS CERCANA A PIE al origen y al destino (mira las coordenadas), no la de la línea más conocida. Combinación sencilla, con pocos transbordos. Si el último tramo se hace mejor andando, súmalo a "a_pie_hasta_destino" en vez de añadir otro vehículo.
- "sube_coords" y "baja_coords": coordenadas [lat, lng] con 5 decimales de la entrada de la estación (o parada de bus) que usas, la más cercana al sitio desde el que llegas o al que vas. Son importantes: con ellas se calcula el tiempo andando.
- Minutos a pie: por calles reales a unos 75 m por minuto, no en línea recta. En estaciones grandes (Shinjuku, Tokyo, Shibuya, Ikebukuro, Ueno, Kyoto, Osaka/Umeda, Namba…) suma lo que se tarda dentro de la estación hasta el andén: suelen ser 5–10 min.
- "minutos" de cada tramo: solo el tiempo dentro del vehículo. "espera": minutos de espera media en el andén o la parada A ESA HORA (metro en hora punta 2–3, un bus de montaña puede ser 30 o más).
- Si andando directamente se tarda lo mismo o menos que en transporte público (contando los tramos a pie), "compensa" es false con motivo "cerca": no tiene sentido coger el metro para dos minutos.
- "compensa": false si se va casi todo andando, si no hay una línea útil o si tarda más del doble que el coche sin ventaja clara. En ese caso:
  · "motivo": uno de "cerca" (está tan cerca que se va mejor andando), "sin_linea" (no hay ninguna línea que lo haga bien), "transbordos" (exigiría demasiados transbordos), "lento" (en transporte público se tarda mucho más que en coche/taxi), "horario" (a esa hora no hay servicio o pasa muy de tarde en tarde), "otro".
  · "alternativa": "walk" (andando), "taxi" o "car" (coche propio): lo que recomendarías en su lugar.
  · "consejo": explícalo en 1–2 frases concretas, como a un amigo: por dónde ir andando (calles, puentes, parques), qué se ve por el camino, cuánto cuesta un taxi aproximado, o por qué el metro da un rodeo.
  · Si existe una opción en transporte público aunque no sea la mejor, rellena igualmente "tramos" y "total_minutos" para poder compararla; si no existe, deja "tramos" vacío.
- Si "compensa" es true, "motivo" y "alternativa" van a null.
- "sube", "baja" y "linea" llevan SOLO el nombre, sin comentarios.
- "estaciones": TODAS las estaciones del tramo en orden, desde la de subida (la primera, igual que "sube") hasta la de bajada (la última, igual que "baja"). "paradas" es el número de estaciones menos uno.
- Antes de responder, repasa cada tramo: ¿esa línea pasa DE VERDAD por la estación de subida y por la de bajada? Es el error más habitual (p. ej. la Ginza Line no llega a Oshiage). Si no pasa, cambia de línea o de estación.
- "color": el color oficial de la línea en hex (#RRGGBB), o null si no lo sabes seguro.
- "transbordo_a_pie": minutos andando de transbordo ANTES de subir a ese tramo (0 en el primero), incluido el paseo por dentro de la estación.
- "total_minutos": puerta a puerta, con los tramos a pie y la espera en el andén.
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
          "sube_coords": [35.71072, 139.79784],
          "baja": "Shibuya (渋谷)",
          "baja_coords": [35.65907, 139.70216],
          "estaciones": ["Asakusa (浅草)", "Tawaramachi (田原町)", "…", "Shibuya (渋谷)"],
          "paradas": 18,
          "minutos": 33,
          "direccion": "Shibuya",
          "color": "#FF9500",
          "espera": 3,
          "transbordo_a_pie": 0
        }
      ],
      "a_pie_hasta_destino": 3,
      "total_minutos": 45,
      "resumen": "Ginza Line",
      "precio": "≈ 250 ¥",
      "consejo": "Sal por la salida Hachikō.",
      "motivo": null,
      "alternativa": null
    }
  ]
}
\`\`\`

"tipo" es uno de: metro, train, bus, tram, ferry. Se pueden combinar: si lo mejor es un tren y luego un bus (o un metro y un ferry), pon un elemento en "tramos" por cada uno, en orden, con la parada de bus como "sube"/"baja".

Trayectos:
${list}`
}

const num = z.number().nullish().catch(null)
const str = z.string().nullish().catch(null)
const coords = z.array(z.number()).length(2).nullish().catch(null)
const Ride = z.object({
  tipo: str, linea: str, operador: str, sube: str, baja: str, sube_coords: coords, baja_coords: coords,
  paradas: num, minutos: num, direccion: str, color: str, transbordo_a_pie: num,
  estaciones: z.array(z.string()).nullish().catch(null),
  espera: num,
})
const Item = z.object({
  ref: z.string(),
  compensa: z.boolean().catch(false),
  a_pie_hasta_estacion: num,
  tramos: z.array(Ride).nullish().catch([]),
  a_pie_hasta_destino: num,
  total_minutos: num,
  resumen: str, precio: str, consejo: str,
  motivo: z.enum(['cerca', 'sin_linea', 'transbordos', 'lento', 'horario', 'otro']).nullish().catch(null),
  alternativa: z.enum(['walk', 'taxi', 'car']).nullish().catch(null),
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

// Los minutos a pie que da la IA son a ojo (no sabe dónde está la entrada de
// la estación) y no cuadraban con Google Maps. Si nos da las coordenadas de la
// estación, los calculamos: distancia real × rodeo por calles, a paso de turista.
const WALK_DETOUR = 1.3         // las calles no van en línea recta
const WALK_M_PER_MIN = 75       // ≈ 4,5 km/h
const MAX_STATION_KM = 3        // más lejos: coordenadas dudosas, mejor la cifra de la IA
// Espera media en el andén por cada vehículo: el metro pasa cada pocos minutos.
const WAIT_MIN: Record<string, number> = { metro: 3, tram: 4, train: 5, bus: 6, ferry: 10, other: 5 }

// "Shibuya (渋谷)", "shibuya station", "Shibuya" → "shibuya": para comparar
// nombres de estación sin que molesten el kanji, mayúsculas o guiones.
export function stationKey(name: string): string {
  return name.replace(/\(.*?\)/g, '').replace(/\b(station|eki|駅)\b/gi, '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u3040-\u9fff]/g, '')
}

// ¿Empieza y acaba la lista de estaciones donde dice la IA que subes y bajas?
// Si no, probablemente se ha equivocado de línea o de estación.
function checkStations(r: { sube?: string | null; baja?: string | null; estaciones?: string[] | null }) {
  const list = (r.estaciones ?? []).map(x => x.trim()).filter(x => x && x !== '…' && x !== '...')
  if (list.length < 2) return { stations: null, doubtful: false, stops: null }
  const sameEnds = (!r.sube || stationKey(list[0]) === stationKey(r.sube))
    && (!r.baja || stationKey(list[list.length - 1]) === stationKey(r.baja))
  // Las paradas no se comparan: las IAs cuentan a veces la de subida y fallan
  // por una, sin que eso signifique que la línea esté mal. Mandan las de la lista.
  return { stations: list.slice(0, 60), doubtful: !sameEnds, stops: list.length - 1 }
}

const toPoint = (c: number[] | null | undefined): GeoPoint | null =>
  c && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180 ? { lat: c[0], lng: c[1] } : null

export function walkMinutes(a: GeoPoint, b: GeoPoint): number {
  const meters = haversineKm(a, b) * 1000 * WALK_DETOUR
  return Math.max(1, Math.ceil(meters / WALK_M_PER_MIN))
}

export function walkMeters(a: GeoPoint, b: GeoPoint): number {
  return haversineKm(a, b) * 1000 * WALK_DETOUR
}

// Qué conviene cuando el transporte público no compensa. Las filas de antes
// de la 063 no lo traen: se deduce de lo que se tarda andando.
export const WALK_INSTEAD_MAX_MIN = 25
// Margen para el empate: si andando se tarda como mucho esto más que en
// transporte público, se prefiere andar (sin esperas, sin transbordos).
export const WALK_TIE_MIN = 3

// Cuánto de una ruta es andar, esperar y estar dentro del vehículo.
export interface TransitBreakdown { total: number; walk: number; ride: number; wait: number }
export function transitBreakdown(route: { steps: TransitStep[] | null; total_minutes: number | null }): TransitBreakdown | null {
  const steps = route.steps ?? []
  if (route.total_minutes == null || !steps.some(s => s.kind !== 'walk')) return null
  const walk = steps.filter(s => s.kind === 'walk').reduce((n, s) => n + (s.minutes ?? 0), 0)
  const ride = steps.filter(s => s.kind !== 'walk').reduce((n, s) => n + (s.minutes ?? 0), 0)
  return { total: route.total_minutes, walk, ride, wait: Math.max(0, route.total_minutes - walk - ride) }
}

// Ahorrar andar también cuenta: si el transporte público tarda casi lo mismo
// que ir andando (hasta LESS_WALK_EXTRA_MIN más) pero te quita al menos
// LESS_WALK_SAVED_MIN de caminar, se recomienda.
export const LESS_WALK_SAVED_MIN = 12
export const LESS_WALK_EXTRA_MIN = 8

export interface TransitVerdict {
  worth: boolean
  reason: TransitSkipReason | null
  alternative: TransitAlternative | null
  /** Por qué compensa: llegas antes, o tardas parecido pero andas mucho menos. */
  why: 'faster' | 'less_walking' | null
  walkMinutes: number
  breakdown: TransitBreakdown | null
}

// Lo que se muestra, decidido aquí y no solo por la IA, comparando con ir
// andando: tiempo total y cuánto se camina. Vale también para filas ya
// guardadas. Solo se corrige a la IA cuando el motivo es la distancia (o no
// lo dio): si dijo "a esa hora no hay servicio", manda ella.
export function transitVerdict(route: TransitRoute, from: GeoPoint, to: GeoPoint): TransitVerdict {
  const W = walkMinutes(from, to)
  const b = transitBreakdown(route)
  const base = { walkMinutes: W, breakdown: b }
  const aboutDistance = route.worth_it || route.skip_reason == null || route.skip_reason === 'cerca'
  if (b && aboutDistance) {
    const faster = b.total + WALK_TIE_MIN < W
    const lessWalking = W - b.walk >= LESS_WALK_SAVED_MIN && b.total <= W + LESS_WALK_EXTRA_MIN
    if (faster || lessWalking) {
      return { ...base, worth: true, reason: null, alternative: null, why: faster ? 'faster' : 'less_walking' }
    }
    if (W <= b.total + WALK_TIE_MIN || W <= WALK_INSTEAD_MAX_MIN) {
      return { ...base, worth: false, reason: 'cerca', alternative: 'walk', why: null }
    }
  }
  if (route.worth_it) return { ...base, worth: true, reason: null, alternative: null, why: null }
  return { ...base, worth: false, reason: route.skip_reason ?? 'otro', alternative: bestAlternative(route, from, to), why: null }
}

export function bestAlternative(
  route: { worth_it: boolean; alternative: TransitAlternative | null },
  from: GeoPoint, to: GeoPoint,
): TransitAlternative | null {
  if (route.worth_it) return null
  if (route.alternative) return route.alternative
  return walkMinutes(from, to) <= WALK_INSTEAD_MAX_MIN ? 'walk' : 'car'
}

// Minutos andando entre dos puntos si las coordenadas son creíbles; si no, lo
// que dijo la IA.
function walkBetween(a: GeoPoint | null, b: GeoPoint | null, fallback: number | null, maxKm = MAX_STATION_KM): number | null {
  if (a && b && haversineKm(a, b) <= maxKm) return walkMinutes(a, b)
  return fallback
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
      const toWalk = walkBetween(input.leg.origin, toPoint(rides[0].sube_coords), mins(t.a_pie_hasta_estacion))
      if (toWalk) steps.push(walk(toWalk))
      rides.forEach((r, i) => {
        if (i > 0) {
          // Transbordo: si son estaciones distintas (bajas en una y subes en
          // otra), se calcula el paseo; dentro de la misma estación manda la IA.
          const prevOut = toPoint(rides[i - 1].baja_coords)
          const nextIn = toPoint(r.sube_coords)
          const apart = prevOut && nextIn && haversineKm(prevOut, nextIn) > 0.2
          const transfer = apart ? walkBetween(prevOut, nextIn, mins(r.transbordo_a_pie), 1.5) : mins(r.transbordo_a_pie)
          if (transfer) steps.push(walk(transfer))
        }
        const color = clean(r.color)
        const check = checkStations(r)
        if (check.doubtful) {
          warnings.push(`${ref}: revisa la ${clean(r.linea) ?? 'línea'} entre ${clean(r.sube) ?? '?'} y ${clean(r.baja) ?? '?'}; las estaciones que da no cuadran.`)
        }
        steps.push({
          kind: (RIDE_KINDS.includes(String(r.tipo)) ? r.tipo : 'other') as TransitStep['kind'],
          line: clean(r.linea),
          operator: clean(r.operador),
          line_color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : null,
          from_station: clean(r.sube),
          to_station: clean(r.baja),
          stops: check.stations && !check.doubtful
            ? check.stops
            : typeof r.paradas === 'number' && r.paradas >= 0 ? Math.round(r.paradas) : null,
          stations: check.stations,
          doubtful: check.doubtful,
          minutes: mins(r.minutos),
          direction: clean(r.direccion),
          from_coords: toPoint(r.sube_coords),
          to_coords: toPoint(r.baja_coords),
          wait: typeof r.espera === 'number' && r.espera >= 0 && r.espera <= 180 ? Math.round(r.espera) : null,
        })
      })
      const fromWalk = walkBetween(toPoint(rides[rides.length - 1].baja_coords), input.leg.destination, mins(t.a_pie_hasta_destino))
      if (fromWalk) steps.push(walk(fromWalk))
    }
    // El total se rehace con las piezas (andar + vehículo + espera) para que
    // cuadre con lo que se ve en la ficha; si falta algún tiempo de vehículo,
    // se queda el de la IA.
    const rideSteps = steps.filter(s => s.kind !== 'walk')
    const computedTotal = rideSteps.length > 0 && rideSteps.every(s => s.minutes != null)
      ? steps.reduce((n, s) => n + (s.minutes ?? 0) + (s.kind === 'walk' ? 0 : s.wait ?? WAIT_MIN[s.kind] ?? 5), 0)
      : null
    const total = computedTotal ?? mins(t.total_minutos)
    const aiWorth = t.compensa && rides.length > 0
    // La IA propone; la decisión final compara con ir andando (tiempo y
    // cuánto se camina), igual que al mostrar las filas guardadas.
    const verdict = transitVerdict({
      worth_it: aiWorth, total_minutes: total, steps,
      skip_reason: aiWorth ? null : t.motivo ?? null, alternative: aiWorth ? null : t.alternativa ?? null,
    } as TransitRoute, input.leg.origin, input.leg.destination)
    const worth = verdict.worth
    rows.push({
      from_activity_id: input.leg.fromId,
      to_activity_id: input.leg.toId,
      coords_sig: transitSig(input.leg.origin, input.leg.destination),
      worth_it: worth,
      total_minutes: total,
      summary: clean(t.resumen) ?? (rides.length ? rides.map(r => clean(r.linea)).filter(Boolean).join(' → ') : null),
      fare_text: clean(t.precio),
      note: clean(t.consejo),
      // Si no compensa, los pasos se guardan igual (cuando los hay) para
      // poder enseñar la opción en transporte público como comparación.
      steps,
      skip_reason: worth ? null : verdict.reason !== 'otro' ? verdict.reason : t.motivo ?? (rides.length === 0 ? 'sin_linea' : 'otro'),
      // Andando si lo decide la comparación; si no, lo que dijo la IA (sin
      // inventar: si no dijo nada, se deduce al mostrarlo).
      alternative: worth ? null : verdict.alternative === 'walk' ? 'walk' : t.alternativa ?? null,
    })
  }

  const missing = legs.map((_, i) => refFor(i)).filter(r => !seen.has(r))
  if (missing.length) warnings.push(`Sin respuesta para ${missing.join(', ')}: puedes volver a pedirlos luego.`)
  if (rows.length === 0) throw new TransitImportError('La respuesta no trae ningún trayecto de la lista.')
  return { rows, warnings }
}

export const legKey = (l: PendingLeg) => pairKey(l.fromId, l.toId)
