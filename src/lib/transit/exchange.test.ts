import { describe, expect, it } from 'vitest'
import { buildTransitPrompt, parseTransitResponse, transitVerdict, TransitImportError, type TransitLegInput } from './exchange'
import type { Activity } from '@/types/database'
import { verdictExplanation } from './labels'

const act = (id: string, title: string, lat: number, lng: number): Activity => ({
  id, title, lat, lng, type: 'place', address: null, origin: null, destination: null,
  origin_lat: null, origin_lng: null, destination_lat: null, destination_lng: null,
} as unknown as Activity)

const a = act('a', 'Senso-ji', 35.7148, 139.7967)
const b = act('b', 'Shibuya Crossing', 35.6595, 139.7005)
const c = act('c', 'Torre de Tokio', 35.6586, 139.7454)
const legs: TransitLegInput[] = [
  { from: a, to: b, leg: { fromId: 'a', toId: 'b', mode: 'DRIVING', origin: { lat: a.lat!, lng: a.lng! }, destination: { lat: b.lat!, lng: b.lng! } } },
  { from: b, to: c, leg: { fromId: 'b', toId: 'c', mode: 'DRIVING', origin: { lat: b.lat!, lng: b.lng! }, destination: { lat: c.lat!, lng: c.lng! } } },
]

const answer = `Aquí tienes:
\`\`\`json
{ "trayectos": [
  { "ref": "T1", "compensa": true, "a_pie_hasta_estacion": 5,
    "tramos": [{ "tipo": "metro", "linea": "Ginza Line (G)", "operador": "Tokyo Metro", "sube": "Asakusa (浅草)", "baja": "Shibuya (渋谷)", "paradas": 18, "minutos": 33, "direccion": "Shibuya", "color": "#FF9500", "transbordo_a_pie": 0 }],
    "a_pie_hasta_destino": 3, "total_minutos": 45, "resumen": "Ginza Line", "precio": "≈ 250 ¥", "consejo": null },
  { "ref": "T9", "compensa": true, "tramos": [] }
] }
\`\`\``

describe('transporte público por copia y pega', () => {
  it('el prompt numera los trayectos y lleva las coordenadas', () => {
    const p = buildTransitPrompt('Japón', legs)
    expect(p).toContain('T1. DESDE Senso-ji')
    expect(p).toContain('T2. DESDE Shibuya Crossing')
    expect(p).toContain('35.71480, 139.79670')
  })

  it('convierte la respuesta en pasos y avisa de lo que sobra o falta', () => {
    const { rows, warnings } = parseTransitResponse(answer, legs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ from_activity_id: 'a', to_activity_id: 'b', worth_it: true, total_minutes: 44, coords_sig: '35.7148,139.7967|35.6595,139.7005' })
    expect(rows[0].steps.map(s => s.kind)).toEqual(['walk', 'metro', 'walk'])
    expect(rows[0].steps[1]).toMatchObject({ line: 'Ginza Line (G)', from_station: 'Asakusa (浅草)', stops: 18, line_color: '#FF9500' })
    expect(warnings.join(' ')).toContain('T9')
    expect(warnings.join(' ')).toContain('T2')
  })

  it('sin tramos no compensa aunque la IA diga que sí', () => {
    const { rows } = parseTransitResponse('{"trayectos":[{"ref":"t2","compensa":true,"tramos":[],"consejo":"Mejor andando"}]}', legs)
    expect(rows[0]).toMatchObject({ to_activity_id: 'c', worth_it: false, steps: [], note: 'Mejor andando' })
  })

  it('texto sin JSON da un error claro', () => {
    expect(() => parseTransitResponse('hola', legs)).toThrow(TransitImportError)
  })
})

describe('tiempos a pie y combinaciones', () => {
  it('calcula andando con las coordenadas de la estación y rehace el total', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: true, a_pie_hasta_estacion: 2, a_pie_hasta_destino: 1, total_minutos: 20,
      tramos: [{ tipo: 'metro', linea: 'Ginza Line (G)', sube: 'Asakusa (浅草)', sube_coords: [35.71072, 139.79784], baja: 'Shibuya (渋谷)', baja_coords: [35.65907, 139.70216], minutos: 33 }],
    }] })
    const { rows } = parseTransitResponse(resp, legs)
    const [toWalk, ride, fromWalk] = rows[0].steps
    // Senso-ji → entrada de Asakusa son ~400 m en línea recta: más que los 2 min que dijo la IA.
    expect(toWalk.minutes).toBeGreaterThan(5)
    expect(fromWalk.minutes).toBeGreaterThan(1)
    expect(ride.from_coords).toEqual({ lat: 35.71072, lng: 139.79784 })
    // andar + 33 min de metro + 3 de espera, no los 20 de la IA
    expect(rows[0].total_minutes).toBe(toWalk.minutes! + 33 + 3 + fromWalk.minutes!)
  })

  it('si las coordenadas de la estación son absurdas, se queda la cifra de la IA', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: true, a_pie_hasta_estacion: 4,
      tramos: [{ tipo: 'metro', linea: 'Ginza Line (G)', sube: 'Asakusa', sube_coords: [40.4, -3.7], baja: 'Shibuya', minutos: 33 }],
    }] })
    expect(parseTransitResponse(resp, legs).rows[0].steps[0].minutes).toBe(4)
  })

  it('tren y luego bus: dos tramos con el paseo de transbordo entre la estación y la parada', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T2', compensa: true, a_pie_hasta_estacion: 5, a_pie_hasta_destino: 3,
      tramos: [
        { tipo: 'train', linea: 'JR Yamanote Line', sube: 'Shibuya (渋谷)', sube_coords: [35.65907, 139.70216], baja: 'Hamamatsucho (浜松町)', baja_coords: [35.65553, 139.75710], minutos: 20 },
        { tipo: 'bus', linea: 'Toei Bus 都01', sube: 'Daimon (大門)', sube_coords: [35.65650, 139.75440], baja: 'Tokyo Tower', baja_coords: [35.65790, 139.74700], minutos: 6, transbordo_a_pie: 9 },
      ],
    }] })
    const kinds = parseTransitResponse(resp, legs).rows[0].steps.map(s => s.kind)
    expect(kinds).toEqual(['walk', 'train', 'walk', 'bus', 'walk'])
  })
})

describe('cuando no compensa', () => {
  it('guarda el motivo, la alternativa y la ruta de comparación', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: false, motivo: 'lento', alternativa: 'taxi', consejo: 'El metro da un rodeo enorme.', total_minutos: 50,
      tramos: [{ tipo: 'metro', linea: 'Ginza Line (G)', sube: 'Asakusa', baja: 'Shibuya', minutos: 33 }],
    }] })
    const [row] = parseTransitResponse(resp, legs).rows
    expect(row).toMatchObject({ worth_it: false, skip_reason: 'lento', alternative: 'taxi' })
    expect(row.steps.some(s => s.kind === 'metro')).toBe(true)
  })

  it('sin motivo ni tramos, el motivo es que no hay línea; si compensa, van a null', () => {
    const resp = JSON.stringify({ trayectos: [
      { ref: 'T1', compensa: false, tramos: [] },
      { ref: 'T2', compensa: true, motivo: 'cerca', alternativa: 'walk', tramos: [{ tipo: 'metro', linea: 'X', sube: 'A', baja: 'B', minutos: 5 }] },
    ] })
    const [a, b] = parseTransitResponse(resp, legs).rows
    expect(a).toMatchObject({ skip_reason: 'sin_linea', alternative: null })
    expect(b).toMatchObject({ skip_reason: null, alternative: null })
  })
})

describe('comprobación de estaciones', () => {
  const answerWith = (ride: object) => JSON.stringify({ trayectos: [{ ref: 'T1', compensa: true, tramos: [{ tipo: 'metro', linea: 'Ginza Line (G)', minutos: 5, ...ride }] }] })

  it('con la lista coherente, las paradas salen de la lista', () => {
    const { rows, warnings } = parseTransitResponse(answerWith({
      sube: 'Asakusa (浅草)', baja: 'Inaricho (稲荷町)', paradas: 3,
      estaciones: ['Asakusa', 'Tawaramachi (田原町)', 'Inaricho station'],
    }), legs)
    const ride = rows[0].steps.find(s => s.kind === 'metro')!
    expect(ride).toMatchObject({ doubtful: false, stops: 2 })
    expect(ride.stations).toHaveLength(3)
    expect(warnings).toHaveLength(1) // solo el de T2 sin respuesta
  })

  it('si la lista no empieza o acaba donde dice, se marca para revisar', () => {
    const { rows, warnings } = parseTransitResponse(answerWith({
      sube: 'Oshiage (押上)', baja: 'Inaricho', estaciones: ['Asakusa', 'Tawaramachi', 'Inaricho'],
    }), legs)
    expect(rows[0].steps.find(s => s.kind === 'metro')!.doubtful).toBe(true)
    expect(warnings.join(' ')).toContain('revisa la Ginza Line')
  })

  it('el prompt de corrección lleva lo que se propuso antes', () => {
    const p = buildTransitPrompt('Japón', [{ ...legs[0], previous: 'Ginza Line de Oshiage a Inaricho' }])
    expect(p).toContain('Antes se propuso: Ginza Line de Oshiage a Inaricho')
  })
})

// Una ruta guardada con [andar, metro, andar] minutos y su total.
const route = (total: number, [w1, ride, w2]: number[]) => ({
  worth_it: true, total_minutes: total, skip_reason: null, alternative: null,
  steps: [
    { kind: 'walk', minutes: w1 }, { kind: 'metro', line: 'Ginza Line (G)', minutes: ride }, { kind: 'walk', minutes: w2 },
  ],
}) as unknown as Parameters<typeof transitVerdict>[0]

describe('día, hora y sentido común', () => {
  const kabuki = act('k', 'Kabukicho', 35.6960834, 139.7026251)
  const hotel = act('h', 'Shinjuku Washington Hotel Annex', 35.6863463, 139.69271)
  const shortLeg: TransitLegInput = {
    from: { ...kabuki, start_time: '22:00:00', end_time: '23:00:00' } as Activity,
    to: { ...hotel, type: 'hotel', start_time: '15:00:00' } as Activity,
    date: '2026-11-25',
    leg: { fromId: 'k', toId: 'h', mode: 'DRIVING', origin: { lat: kabuki.lat!, lng: kabuki.lng! }, destination: { lat: hotel.lat!, lng: hotel.lng! } },
  }

  it('el prompt dice el día y la hora de salida, sin la hora de check-in del hotel', () => {
    const p = buildTransitPrompt('Japón', [shortLeg])
    expect(p).toContain('CUÁNDO: miércoles 25 de noviembre de 2026, saliendo hacia las 23:00 (al acabar «Kabukicho»)')
    expect(p).not.toContain('llegar a las 15:00')
  })

  it('11 min andando + 2 de metro + 16 andando no compensa si andando son ~25', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: true, a_pie_hasta_estacion: 11, a_pie_hasta_destino: 16,
      tramos: [{ tipo: 'metro', linea: 'Marunouchi Line (M)', sube: 'Shinjuku-sanchome', baja: 'Shinjuku', minutos: 2 }],
    }] })
    const [row] = parseTransitResponse(resp, [shortLeg]).rows
    expect(row).toMatchObject({ worth_it: false, skip_reason: 'cerca', alternative: 'walk' })
    expect(row.steps.some(s => s.kind === 'metro')).toBe(true) // se guarda para comparar
  })

  it('una ruta ya guardada como "compensa" también se corrige al mostrarla', () => {
    const saved = route(32, [11, 2, 16])
    expect(transitVerdict(saved, shortLeg.leg.origin, shortLeg.leg.destination)).toMatchObject({ worth: false, reason: 'cerca', alternative: 'walk' })
  })

  it('la espera que da la IA para esa hora entra en el total', () => {
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: true, tramos: [{ tipo: 'bus', linea: 'Nohi Bus', sube: 'A', baja: 'B', minutos: 50, espera: 30 }],
    }] })
    const [row] = parseTransitResponse(resp, legs).rows
    expect(row.total_minutes).toBe(80)
    expect(row.steps[0].wait).toBe(30)
  })
})

describe('andar menos también cuenta', () => {
  // Dos puntos a ~29 min andando (≈1,67 km en línea recta).
  const a = { lat: 35.6895, lng: 139.6917 }
  const b = { lat: 35.6745, lng: 139.6917 }

  it('25 min con solo 5 andando gana a 29 andando: llegas antes', () => {
    const v = transitVerdict(route(25, [3, 20, 2]), a, b)
    expect(v.walkMinutes).toBe(29)
    expect(v).toMatchObject({ worth: true, why: 'faster' })
    expect(verdictExplanation(v, 'Ginza Line (G)')).toBe('Llegas 4 min antes que andando (29 min) y solo caminas 5.')
  })

  it('tardar un poco más pero caminar mucho menos también se recomienda', () => {
    const v = transitVerdict(route(33, [4, 25, 0]), a, b)
    expect(v).toMatchObject({ worth: true, why: 'less_walking' })
    expect(verdictExplanation(v, null)).toBe('Andando llegarías 4 min antes, pero así caminas 4 min en vez de 29.')
  })

  it('si el transporte apenas te ahorra andar, mejor andando, y explica el reparto', () => {
    const v = transitVerdict(route(30, [12, 12, 6]), a, b)
    expect(v).toMatchObject({ worth: false, reason: 'cerca', alternative: 'walk' })
    expect(verdictExplanation(v, 'Ginza Line (G)')).toBe(
      'En transporte público serían 30 min: 18 andando y 12 en Ginza Line (G). Andando (29 min) llegas antes y sin esperas.')
  })

  it('si la IA dijo que a esa hora no hay servicio, no se le lleva la contraria', () => {
    const r = { ...route(20, [2, 16, 2]), worth_it: false, skip_reason: 'horario' } as Parameters<typeof transitVerdict>[0]
    expect(transitVerdict(r, a, b)).toMatchObject({ worth: false, reason: 'horario' })
  })
})

describe('casos reales del viaje a Japón', () => {
  it('ferry marcado en Hiroshima: no 318 min andando, sino los 5 de la IA y aviso', () => {
    const r = { worth_it: false, skip_reason: 'cerca', alternative: 'walk', total_minutes: 5, steps: [] } as unknown as Parameters<typeof transitVerdict>[0]
    const v = transitVerdict(r, { lat: 34.3122, lng: 132.3036 }, { lat: 34.3963, lng: 132.4596 })
    expect(v).toMatchObject({ worth: false, alternative: 'walk', walkMinutes: 5, coordsSuspect: true })
  })

  it('andar dentro de la estación: si la IA da más que el mapa, manda la IA', () => {
    const omote = act('o', 'Omote-sando', 35.667355, 139.707743)
    const hachi = act('h', 'Hachiko', 35.6590579, 139.7006293)
    const leg: TransitLegInput = { from: omote, to: hachi, leg: { fromId: 'o', toId: 'h', mode: 'DRIVING', origin: { lat: omote.lat!, lng: omote.lng! }, destination: { lat: hachi.lat!, lng: hachi.lng! } } }
    const resp = JSON.stringify({ trayectos: [{
      ref: 'T1', compensa: true, a_pie_hasta_estacion: 5, a_pie_hasta_destino: 6,
      tramos: [{ tipo: 'metro', linea: 'Fukutoshin Line (F)', sube: 'Meiji-jingumae', sube_coords: [35.6685, 139.7056], baja: 'Shibuya', baja_coords: [35.6595, 139.7009], minutos: 2 }],
    }] })
    const steps = parseTransitResponse(resp, [leg]).rows[0].steps
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'walk', minutes: 6 }) // no 1
  })
})

describe('trayecto a pie estimado', () => {
  it('da una cifra aproximada entre dos sitios pegados (Hachiko → Shibuya Crossing)', async () => {
    const { estimatedWalkLeg } = await import('./exchange')
    const { formatTravelLeg } = await import('@/lib/travelTime')
    const leg = estimatedWalkLeg({ lat: 35.6590579, lng: 139.7006293 }, { lat: 35.659482, lng: 139.7005596 })
    expect(leg.mode).toBe('WALKING')
    expect(leg.estimated).toBe(true)
    expect(leg.distanceMeters).toBeGreaterThan(40)
    expect(leg.distanceMeters).toBeLessThan(90)
    expect(formatTravelLeg(leg)).toMatch(/^≈ 1 min · \d+ m$/)
  })
})
