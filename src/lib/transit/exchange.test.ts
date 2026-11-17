import { describe, expect, it } from 'vitest'
import { buildTransitPrompt, parseTransitResponse, TransitImportError, type TransitLegInput } from './exchange'
import type { Activity } from '@/types/database'

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
    expect(rows[0]).toMatchObject({ from_activity_id: 'a', to_activity_id: 'b', worth_it: true, total_minutes: 45, coords_sig: '35.7148,139.7967|35.6595,139.7005' })
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
