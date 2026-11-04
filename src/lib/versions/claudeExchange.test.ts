import { describe, it, expect } from 'vitest'
import type { ItineraryDay, SnapshotActivity } from '@/types/database'
import { buildExportFile, extractJson, ImportError, parseClaudeResponse, refsFor } from './claudeExchange'
import { itemsOn } from './snapshot'

const DATES = ['2026-11-21', '2026-11-22']

const act = (a: Partial<SnapshotActivity> & { id: string; date: string }): SnapshotActivity => ({
  type: 'place', title: a.id, description: null, address: null,
  start_time: null, end_time: null, price: null, external_link: null, notes: null,
  order_index: 0, place_id: null, origin: null, destination: null,
  lat: null, lng: null, origin_lat: null, origin_lng: null,
  destination_lat: null, destination_lng: null, cover_image_url: null,
  day_orders: {}, done: false, created_at: '',
  origin_tz: null, destination_tz: null, fixed_time: false, end_date: null,
  ...a,
})

const id = (s: string) => `${s.padEnd(8, '0')}-0000-4000-8000-000000000000`
const LIVE = [
  act({ id: id('hotel'), type: 'hotel', title: 'Hotel Shinjuku', date: '2026-11-20', end_date: '2026-11-25' }),
  act({ id: id('senso'), title: 'Senso-ji', date: DATES[0], start_time: '09:00:00', order_index: 0 }),
  act({ id: id('shibuya'), title: 'Shibuya Sky', date: DATES[0], order_index: 1 }),
  act({ id: id('tren'), type: 'transport', title: 'Tren', date: DATES[1], order_index: 0 }),
  act({ id: id('meiji'), title: 'Meiji', date: DATES[1], start_time: '09:00:00', order_index: 1 }),
  act({ id: id('ropp'), title: 'Roppongi', date: DATES[1], start_time: '21:00:00', order_index: 2 }),
]
const ref = (s: string) => id(s).slice(0, 8)

const respuesta = (body: object) => `Aquí tienes la propuesta:\n\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\`\n\n¡Buen viaje!`

describe('exportar', () => {
  it('incluye las reglas, las preferencias y cada actividad con su ref', () => {
    const days = DATES.map(date => ({ id: date, date, cities: [{ name: 'Tokio', guide_id: null }] })) as unknown as ItineraryDay[]
    const md = buildExportFile({ name: 'Japón', destination: 'Japón', start_date: DATES[0], end_date: DATES[1] }, days, LIVE,
      { start: '08:30', end: '19:00', pace: 'normal', notes: 'Sin madrugar el domingo' })
    expect(md).toContain('08:30')
    expect(md).toContain('Sin madrugar el domingo')
    expect(md).toContain(`"ref": "${ref('senso')}"`)
    expect(md).toContain('"fijo": true')
    expect(md).toContain('"hotel": "Hotel Shinjuku"')
    expect(md).not.toContain(`"ref": "${ref('hotel')}"`)
  })

  it('alarga las refs si dos ids empiezan igual', () => {
    const r = refsFor([act({ id: 'abcdefgh-1', date: DATES[0] }), act({ id: 'abcdefgh-2', date: DATES[0] })])
    expect(new Set(r.values()).size).toBe(2)
  })
})

describe('importar', () => {
  it('encuentra el JSON aunque venga con texto alrededor', () => {
    expect(extractJson(respuesta({ dias: [] }))).toEqual({ dias: [] })
    expect(extractJson('{"dias": []}')).toEqual({ dias: [] })
    expect(() => extractJson('no hay nada')).toThrow(ImportError)
  })

  it('mueve, cambia horas, añade y quita', () => {
    const r = parseClaudeResponse(respuesta({
      nombre: 'Por zonas',
      resumen: 'Shibuya con Harajuku.',
      dias: [
        { fecha: DATES[0], explicacion: 'Asakusa entero.', actividades: [{ ref: ref('senso'), inicio: '08:30' }] },
        { fecha: DATES[1], actividades: [
          { ref: ref('tren'), inicio: '07:00' },
          { ref: ref('meiji'), inicio: '08:30' },
          { ref: ref('shibuya'), inicio: '16:00' },
          { nueva: { titulo: 'Nakameguro', tipo: 'place', lat: 35.64, lng: 139.70 }, inicio: '14:00' },
        ] },
      ],
      quitadas: [ref('ropp')],
    }), LIVE, DATES)

    expect(r.name).toBe('Por zonas')
    expect(r.explanations).toEqual({ [DATES[0]]: 'Asakusa entero.' })
    expect(itemsOn(r.snapshot, DATES[0]).map(a => [a.title, a.start_time])).toEqual([['Senso-ji', '08:30:00']])
    expect(itemsOn(r.snapshot, DATES[1]).map(a => [a.title, a.start_time, a.order_index])).toEqual([
      ['Tren', '07:00:00', 0], ['Meiji', '08:30:00', 1], ['Shibuya Sky', '16:00:00', 2], ['Nakameguro', '14:00:00', 3],
    ])
    expect(r.snapshot.find(a => a.title === 'Roppongi')).toBeUndefined()
    expect(r.snapshot.find(a => a.type === 'hotel')).toBeDefined()
    expect(r.warnings).toEqual([])
  })

  it('no mueve lo fijo ni lo quita, y avisa', () => {
    const r = parseClaudeResponse(respuesta({
      dias: [{ fecha: DATES[0], actividades: [{ ref: ref('tren') }, { ref: ref('senso') }, { ref: ref('shibuya') }] },
             { fecha: DATES[1], actividades: [{ ref: ref('meiji') }, { ref: ref('ropp') }] }],
      quitadas: [ref('tren')],
    }), LIVE, DATES)
    expect(r.snapshot.find(a => a.title === 'Tren')?.date).toBe(DATES[1])
    expect(r.warnings.some(w => w.includes('es fijo y lo había movido'))).toBe(true)
    expect(r.warnings.some(w => w.includes('no lo quito'))).toBe(true)
  })

  it('deja donde estaba lo que no se menciona y avisa de refs desconocidas', () => {
    const r = parseClaudeResponse(respuesta({
      dias: [{ fecha: DATES[1], actividades: [{ ref: 'zzzzzzzz' }, { ref: ref('tren') }, { ref: ref('ropp') }] }],
    }), LIVE, DATES)
    expect(r.warnings[0]).toContain('zzzzzzzz')
    expect(r.warnings.at(-1)).toContain('3 actividades no venían')
    // Meiji (09:00) se coloca por su hora entre el tren y Roppongi (21:00).
    expect(itemsOn(r.snapshot, DATES[1]).map(a => a.title)).toEqual(['Tren', 'Meiji', 'Roppongi'])
  })

  it('explica qué falla si el JSON no cuadra', () => {
    expect(() => parseClaudeResponse(respuesta({ dias: [{ fecha: 'mañana', actividades: [] }] }), LIVE, DATES))
      .toThrow(/dias\.0\.fecha/)
  })
})
