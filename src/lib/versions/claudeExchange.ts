import { z } from 'zod'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ItineraryDay, SnapshotActivity, Trip } from '@/types/database'
import { hhmm, hotelFor } from './snapshot'

// Pedir a Claude una propuesta de itinerario SIN la API: la app genera un
// archivo con el viaje e instrucciones, el usuario se lo pasa a Claude en el
// chat, y la respuesta (un bloque JSON) se importa como una versión nueva que
// se compara con la actual. Nunca se aplica sola.
//
// Las actividades se nombran con los primeros caracteres de su id ("ref"): así
// la respuesta se puede importar días después, sin guardar ningún mapa.

export const FORMAT_ID = 'wanderlog-propuesta/v1'

export interface ExportPrefs {
  start: string
  end: string
  pace: 'tranquilo' | 'normal' | 'intenso'
  notes: string
}

const isMove = (a: SnapshotActivity) => a.type === 'transport' || a.type === 'flight'
/** Lo que no se puede mover: vuelos, trenes y lo marcado con hora fija. */
export const isFixed = (a: SnapshotActivity) => isMove(a) || a.fixed_time

/** Ref corta y única para cada actividad (8 caracteres del id, más si chocan). */
export function refsFor(snap: SnapshotActivity[]): Map<string, string> {
  for (let len = 8; len <= 36; len += 4) {
    const refs = new Map(snap.map(a => [a.id, a.id.slice(0, len)]))
    if (new Set(refs.values()).size === refs.size) return refs
  }
  return new Map(snap.map(a => [a.id, a.id]))
}

const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function buildExportFile(trip: Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date'>,
  days: ItineraryDay[], snap: SnapshotActivity[], prefs: ExportPrefs): string {
  const refs = refsFor(snap)
  const dayInfo = days.map(d => ({
    fecha: d.date,
    dia_semana: format(parseISO(d.date), 'EEEE', { locale: es }),
    ciudades: (d.cities?.length ? d.cities.map(c => c.name) : [d.city].filter(Boolean)) as string[],
    hotel: hotelFor(snap, d.date)?.title ?? null,
  }))
  const acts = snap
    .filter(a => a.type !== 'hotel')
    .sort((x, y) => (x.date === y.date ? x.order_index - y.order_index : x.date < y.date ? -1 : 1))
    .map(a => ({
      ref: refs.get(a.id)!,
      titulo: a.title,
      tipo: a.type,
      fecha: a.date,
      inicio: hhmm(a.start_time),
      fin: hhmm(a.end_time),
      fijo: isFixed(a),
      lat: a.lat, lng: a.lng,
      ...(isMove(a) ? { origen: a.origin, destino: a.destination } : { direccion: clip(a.address, 80) }),
      notas: clip(a.notes, 240),
    }))

  const data = { formato: FORMAT_ID, viaje: { nombre: trip.name, destino: trip.destination, desde: trip.start_date, hasta: trip.end_date }, dias: dayInfo, actividades: acts }
  const example = {
    formato: FORMAT_ID,
    nombre: 'Nombre corto de la propuesta',
    resumen: 'Dos o tres frases con la idea general.',
    dias: [{
      fecha: days[0]?.date ?? '2026-01-01',
      explicacion: 'Por qué este día queda así, en una o dos frases.',
      actividades: [
        { ref: acts[0]?.ref ?? 'abcd1234', inicio: '08:30' },
        { nueva: { titulo: 'Sitio que añades', tipo: 'place', lat: 0, lng: 0, direccion: 'Dirección' }, inicio: '10:00', fin: '11:00' },
      ],
    }],
    quitadas: [],
  }

  return `# Propuesta de itinerario: ${trip.name}

Hola, Claude. Te paso un viaje exportado desde mi app de viajes (Wanderlog). Quiero que reorganices las visitas de cada ciudad para aprovechar mejor el tiempo, y que me devuelvas la propuesta en el formato de abajo para importarla en la app y compararla con mi plan actual.

## Mis preferencias
- Empezar cada día hacia las **${prefs.start}** y terminar hacia las **${prefs.end}**.
- Ritmo: **${prefs.pace}**.
${prefs.notes.trim() ? `- Además: ${prefs.notes.trim()}\n` : ''}
## Reglas
1. **No cambies nada con \`"fijo": true\`**: vuelos, trenes y reservas con hora. Ni de día ni de hora. Sí puedes decir a qué hora coger un tren que **no** tenga \`inicio\`.
2. Cada día tiene sus ciudades y su hotel. **Solo mueve una actividad a otro día de la misma ciudad.**
3. Agrupa por zonas para no cruzar la ciudad, y ten en cuenta horarios de apertura, días de cierre, festivos del país y la hora a la que se pone el sol.
4. Puedes cambiar el orden y las horas, mover actividades entre días (regla 2), quitar alguna (ponla en \`quitadas\`) o proponer sitios nuevos (\`nueva\`, con coordenadas reales).
5. Cada \`ref\` que no quites tiene que aparecer **una sola vez**. Usa las \`ref\` exactamente como vienen.
6. Escribe las explicaciones en español, claras y breves.

## Cómo responder
Devuélveme **un único bloque de código \`json\`** (o un archivo \`.json\`) con este esquema. Antes o después puedes explicar lo que quieras, pero el bloque es lo que leerá la app:

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

- \`inicio\` y \`fin\`: "HH:MM" o \`null\`. Si no pones \`fin\`, se queda el que tenía.
- \`tipo\` de una nueva: place, activity, restaurant u other.

## El viaje
\`\`\`json
${JSON.stringify(data, null, 1)}
\`\`\`
`
}

// ------------------------------------------------------------------
// Importar la respuesta
// ------------------------------------------------------------------

const time = z.string().regex(/^\d{1,2}:\d{2}/).nullable().optional()
const NewItem = z.object({
  titulo: z.string().min(1),
  tipo: z.enum(['place', 'activity', 'restaurant', 'other']).catch('place'),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  direccion: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
})
const Item = z.object({ ref: z.string().optional(), nueva: NewItem.optional(), inicio: time, fin: time })
  .refine(i => !!i.ref || !!i.nueva, 'Cada actividad necesita "ref" o "nueva"')
const Response = z.object({
  nombre: z.string().optional(),
  resumen: z.string().optional(),
  dias: z.array(z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    explicacion: z.string().optional(),
    actividades: z.array(Item),
  })).min(1),
  quitadas: z.array(z.string()).optional(),
})

export class ImportError extends Error {}

export interface ImportResult {
  name: string
  summary: string | null
  explanations: Record<string, string>
  snapshot: SnapshotActivity[]
  warnings: string[]
}

/** Saca el JSON de la respuesta: el bloque ```json que parezca una propuesta, o el texto entero. */
export function extractJson(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1])
  const candidates = [...blocks.filter(b => b.includes('"dias"')), text.trim(), text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]
  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (v && typeof v === 'object' && 'dias' in v) return v
    } catch { /* siguiente candidato */ }
  }
  throw new ImportError('No encuentro la propuesta en el texto. Pega la respuesta entera de Claude (con el bloque ```json).')
}

const toTime = (t: string | null | undefined) => (t ? `${t.padStart(5, '0').slice(0, 5)}:00` : null)

export function parseClaudeResponse(text: string, live: SnapshotActivity[], dates: string[], now = new Date()): ImportResult {
  const parsed = Response.safeParse(extractJson(text))
  if (!parsed.success) {
    throw new ImportError(`La respuesta no tiene el formato esperado (${parsed.error.issues[0]?.path.join('.') || 'raíz'}: ${parsed.error.issues[0]?.message}).`)
  }
  const r = parsed.data
  const warnings: string[] = []
  const validDates = new Set(dates)
  const refs = refsFor(live)
  const byRef = new Map([...refs].map(([id, ref]) => [ref, live.find(a => a.id === id)!]))
  const out = new Map(live.map(a => [a.id, { ...a }]))
  const placed = new Set<string>()
  const explanations: Record<string, string> = {}

  for (const day of r.dias) {
    if (!validDates.has(day.fecha)) {
      warnings.push(`El ${day.fecha} no es un día del viaje: lo he ignorado.`)
      continue
    }
    if (day.explicacion) explanations[day.fecha] = day.explicacion
    day.actividades.forEach((item, i) => {
      const order = (i + 1) * 10
      if (item.nueva) {
        const n = item.nueva
        const id = crypto.randomUUID()
        out.set(id, {
          ...blank(id), type: n.tipo, title: n.titulo, date: day.fecha, order_index: order,
          lat: n.lat ?? null, lng: n.lng ?? null, address: n.direccion ?? null, notes: n.notas ?? null,
          start_time: toTime(item.inicio), end_time: toTime(item.fin),
        })
        placed.add(id)
        return
      }
      const orig = byRef.get(item.ref!)
      if (!orig) { warnings.push(`No conozco la actividad «${item.ref}»: la he ignorado.`); return }
      if (orig.type === 'hotel') return
      if (placed.has(orig.id)) { warnings.push(`«${orig.title}» aparecía dos veces: me quedo con la primera.`); return }
      const a = out.get(orig.id)!
      placed.add(orig.id)
      a.order_index = order
      if (isFixed(orig)) {
        if (day.fecha !== orig.date) warnings.push(`«${orig.title}» es fijo y lo había movido al ${day.fecha}: lo dejo en su día.`)
        // Un tren sin hora sí puede recibirla: es justo lo que se le pide.
        else if (!orig.start_time && item.inicio) a.start_time = toTime(item.inicio)
        return
      }
      if (day.fecha !== orig.date) {
        const before = hotelFor(live, orig.date)?.id, after = hotelFor(live, day.fecha)?.id
        if (before !== after) warnings.push(`«${orig.title}» pasa a un día con otro hotel (${day.fecha}): revisa que sea la misma ciudad.`)
        if (a.end_date) a.end_date = format(addDays(parseISO(a.end_date), differenceInCalendarDays(parseISO(day.fecha), parseISO(orig.date))), 'yyyy-MM-dd')
        a.date = day.fecha
      }
      if (item.inicio !== undefined) a.start_time = toTime(item.inicio)
      if (item.fin !== undefined) a.end_time = toTime(item.fin)
    })
  }

  for (const ref of r.quitadas ?? []) {
    const orig = byRef.get(ref)
    if (!orig) continue
    if (isFixed(orig)) { warnings.push(`«${orig.title}» es fijo: no lo quito.`); continue }
    out.delete(orig.id)
    placed.delete(orig.id)
  }

  // Lo que la respuesta no menciona se queda donde estaba, colocado por su hora
  // entre lo que sí vino (o al final del día si no tiene hora).
  const missing = live.filter(a => a.type !== 'hotel' && !placed.has(a.id) && out.has(a.id))
  if (missing.length) {
    warnings.push(missing.length === 1
      ? `«${missing[0].title}» no venía en la respuesta: se queda donde estaba.`
      : `${missing.length} actividades no venían en la respuesta: se quedan donde estaban.`)
  }
  for (const a of missing) {
    const sameDay = [...out.values()].filter(x => x.type !== 'hotel' && x.date === a.date && placed.has(x.id))
      .sort((x, y) => x.order_index - y.order_index)
    const t = hhmm(a.start_time)
    const next = t ? sameDay.find(x => { const xt = hhmm(x.start_time); return !!xt && xt > t }) : undefined
    out.get(a.id)!.order_index = next ? next.order_index - 5 : (sameDay.at(-1)?.order_index ?? 0) + 5
    placed.add(a.id)
  }

  // Órdenes limpios 0..n por día, como los deja la app al arrastrar.
  const snapshot = [...out.values()]
  for (const date of dates) {
    snapshot.filter(a => a.type !== 'hotel' && a.date === date)
      .sort((x, y) => x.order_index - y.order_index)
      .forEach((a, i) => { a.order_index = i })
  }

  return {
    name: r.nombre?.trim() || `Propuesta de Claude · ${format(now, "d MMM", { locale: es })}`,
    summary: r.resumen?.trim() || null,
    explanations,
    snapshot,
    warnings,
  }
}

function blank(id: string): SnapshotActivity {
  return {
    id, type: 'place', title: '', description: null, address: null, start_time: null, end_time: null,
    price: null, external_link: null, notes: null, order_index: 0, place_id: null, origin: null, destination: null,
    lat: null, lng: null, origin_lat: null, origin_lng: null, destination_lat: null, destination_lng: null,
    cover_image_url: null, day_orders: {}, done: false, origin_tz: null, destination_tz: null, fixed_time: false,
    created_at: new Date().toISOString(), date: '', end_date: null,
  }
}
