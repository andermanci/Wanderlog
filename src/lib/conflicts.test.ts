import { describe, it, expect } from 'vitest'
import { detectDayConflicts, detectTripConflicts, type Conflict } from './conflicts'
import { pairKey, type TravelLeg } from './travelTime'
import type { DayZones } from './dayTz'
import type { Activity, ItineraryDay } from '@/types/database'

const DAY_ID = 'd1'
const DATE = '2026-05-10'

const day: ItineraryDay = {
  id: DAY_ID, trip_id: 't', date: DATE, notes: null, journal: null,
  guide_id: null, city: null, tz: null,
}

let seq = 0
const act = (a: Partial<Activity> & { title: string }): Activity => ({
  id: a.id ?? `a${++seq}`,
  trip_id: 't', day_id: DAY_ID, end_day_id: null,
  type: 'activity', description: null, address: null,
  start_time: null, end_time: null, price: null, external_link: null, notes: null,
  order_index: seq, place_id: null, origin: null, destination: null,
  lat: null, lng: null, origin_lat: null, origin_lng: null,
  destination_lat: null, destination_lng: null, cover_image_url: null,
  day_orders: {}, done: false, created_at: '',
  origin_tz: null, destination_tz: null,
  ...a,
})

const leg = (mins: number): TravelLeg => ({
  mode: 'DRIVING', distanceMeters: mins * 500, durationSeconds: mins * 60,
})

const noZones: DayZones = { tzByDay: new Map(), multiZoneDayIds: new Set() }

function run(items: Activity[], legs: Map<string, TravelLeg> = new Map(), opts?: {
  arrivals?: Activity[]
  zones?: DayZones
  dates?: Map<string, string>
}): Conflict[] {
  return detectDayConflicts({
    day,
    items,
    arrivals: opts?.arrivals ?? [],
    dateByDayId: opts?.dates ?? new Map([[DAY_ID, DATE]]),
    zones: opts?.zones ?? noZones,
    legs,
  })
}

const kinds = (cs: Conflict[]) => cs.map(c => c.kind)

describe('solapes', () => {
  it('detecta dos actividades que se pisan', () => {
    const conflicts = run([
      act({ title: 'Museo', start_time: '10:00', end_time: '12:00' }),
      act({ title: 'Comida', start_time: '11:30', end_time: '13:00' }),
    ])
    expect(kinds(conflicts)).toEqual(['overlap'])
    expect(conflicts[0].message).toContain('se solapan 30 min')
  })

  it('tocarse los extremos NO es un solape', () => {
    const conflicts = run([
      act({ title: 'Museo', start_time: '10:00', end_time: '12:00' }),
      act({ title: 'Comida', start_time: '12:00', end_time: '13:00' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('dos cosas a la misma hora sin duración también avisan', () => {
    const conflicts = run([
      act({ title: 'Museo', start_time: '10:00' }),
      act({ title: 'Tour', start_time: '10:00' }),
    ])
    expect(kinds(conflicts)).toEqual(['overlap'])
    expect(conflicts[0].message).toContain('a la misma hora')
  })

  it('un hotel de varias noches no solapa con nada', () => {
    // Se repite como banner cada día: si fuera sujeto, chocaría con todo.
    const conflicts = run([
      act({ title: 'Hotel', type: 'hotel', start_time: '15:00', end_time: '11:00' }),
      act({ title: 'Museo', start_time: '10:00', end_time: '18:00' }),
      act({ title: 'Cena', start_time: '20:00', end_time: '22:00' }),
    ])
    expect(conflicts).toEqual([])
  })
})

describe('no llegas', () => {
  it('avisa cuando el trayecto no cabe en el hueco', () => {
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const comida = act({ title: 'Comida', start_time: '12:10' })
    const legs = new Map([[pairKey(museo.id, comida.id), leg(25)]])

    const conflicts = run([museo, comida], legs)
    expect(kinds(conflicts)).toEqual(['unreachable'])
    expect(conflicts[0].message).toBe(
      'No llegas: de «Museo» a «Comida» hay 25 min de trayecto y solo tienes 10.',
    )
    expect(conflicts[0].pairKeys).toEqual([pairKey(museo.id, comida.id)])
  })

  it('suma los trayectos de los items SIN hora que hay en medio', () => {
    // El caso que se tragaría una comparación por pares consecutivos: entre el
    // museo y la comida hay una parada sin hora, y el conflicto es real.
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const tienda = act({ title: 'Souvenirs' })
    const comida = act({ title: 'Comida', start_time: '12:15' })
    const legs = new Map([
      [pairKey(museo.id, tienda.id), leg(10)],
      [pairKey(tienda.id, comida.id), leg(20)],
    ])

    const conflicts = run([museo, tienda, comida], legs)
    expect(kinds(conflicts)).toEqual(['unreachable'])
    expect(conflicts[0].message).toContain('hay 30 min de trayecto y solo tienes 15')
    // Se ilumina el camino entero, no solo el último salto.
    expect(conflicts[0].pairKeys).toHaveLength(2)
  })

  it('avisa de "vas justo" por debajo del margen', () => {
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const comida = act({ title: 'Comida', start_time: '12:30' })
    const legs = new Map([[pairKey(museo.id, comida.id), leg(20)]])

    const conflicts = run([museo, comida], legs)
    expect(kinds(conflicts)).toEqual(['tight'])
    expect(conflicts[0].message).toContain('con 10 min de margen')
  })

  it('calla si hay margen de sobra', () => {
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const comida = act({ title: 'Comida', start_time: '14:00' })
    const legs = new Map([[pairKey(museo.id, comida.id), leg(20)]])
    expect(run([museo, comida], legs)).toEqual([])
  })

  it('sin el tramo, la cadena se rompe y NO se avisa', () => {
    // Nunca subestimar un trayecto: si no se sabe cuánto se tarda, se calla.
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const comida = act({ title: 'Comida', start_time: '12:05' })
    expect(run([museo, comida], new Map())).toEqual([])
  })

  it('sin hora de fin, solo avisa con CERTEZA (nunca "vas justo")', () => {
    // Sin saber cuándo acaba el museo, lo único seguro es que ni saliendo al
    // instante llegarías. Eso sí se avisa; un "vas justo" sería inventado.
    const museo = act({ title: 'Museo', start_time: '10:00' })
    const comida = act({ title: 'Comida', start_time: '10:20' })
    const legs = new Map([[pairKey(museo.id, comida.id), leg(45)]])

    expect(kinds(run([museo, comida], legs))).toEqual(['unreachable'])

    // Mismo caso pero llegando con poco margen: se calla (sería una cota, no un hecho).
    const cena = act({ title: 'Cena', start_time: '11:00' })
    const legs2 = new Map([[pairKey(museo.id, cena.id), leg(50)]])
    expect(run([museo, cena], legs2)).toEqual([])
  })
})

describe('husos horarios', () => {
  const zones: DayZones = { tzByDay: new Map([[DAY_ID, 'Asia/Tokyo']]), multiZoneDayIds: new Set() }

  it('un vuelo con la llegada antes de la salida avisa de que falta el día', () => {
    const vuelo = act({
      title: 'Vuelo a Tokio', type: 'flight',
      start_time: '12:00', end_time: '08:30',
      origin_tz: 'Europe/Madrid', destination_tz: 'Asia/Tokyo',
    })
    const conflicts = run([vuelo], new Map(), { zones })
    expect(kinds(conflicts)).toEqual(['bad-times'])
    expect(conflicts[0].message).toContain('¿Falta indicar el día de llegada?')
  })

  it('con el día de llegada puesto, el mismo vuelo no da ningún conflicto', () => {
    const vuelo = act({
      title: 'Vuelo a Tokio', type: 'flight', end_day_id: 'd2',
      start_time: '12:00', end_time: '08:30',
      origin_tz: 'Europe/Madrid', destination_tz: 'Asia/Tokyo',
    })
    const dates = new Map([[DAY_ID, DATE], ['d2', '2026-05-11']])
    expect(run([vuelo], new Map(), { zones, dates })).toEqual([])
  })

  it('calla si mezcla un huso conocido con uno desconocido', () => {
    // Comparar una hora de Tokio con una hora sin huso daría un resultado
    // inventado. Mejor no avisar que mentir.
    const mixtas: DayZones = { tzByDay: new Map(), multiZoneDayIds: new Set([DAY_ID]) }
    const vuelo = act({
      title: 'Vuelo', type: 'flight', start_time: '10:00', end_time: '11:00',
      origin_tz: 'Europe/Madrid', destination_tz: 'Europe/Madrid',
    })
    const cena = act({ title: 'Cena', start_time: '10:30', end_time: '12:00' })
    expect(run([vuelo, cena], new Map(), { zones: mixtas })).toEqual([])
  })
})

describe('detectTripConflicts', () => {
  it('no evalúa los días pasados', () => {
    const items = [
      act({ title: 'Museo', start_time: '10:00', end_time: '12:00' }),
      act({ title: 'Comida', start_time: '11:00', end_time: '13:00' }),
    ]
    const input = {
      days: [day],
      itemsFor: () => items,
      arrivalsFor: () => [],
      dateByDayId: new Map([[DAY_ID, DATE]]),
      zones: noZones,
      legs: new Map<string, TravelLeg>(),
    }

    // Un viaje ya vivido no puede convertirse en un muro rojo.
    expect(detectTripConflicts({ ...input, today: '2026-06-01' }).byDay.size).toBe(0)
    expect(detectTripConflicts({ ...input, today: '2026-05-01' }).byDay.get(DAY_ID)).toHaveLength(1)
  })

  it('indexa la severidad por tramo para colorear el conector', () => {
    const museo = act({ title: 'Museo', start_time: '10:00', end_time: '12:00' })
    const comida = act({ title: 'Comida', start_time: '12:05' })
    const key = pairKey(museo.id, comida.id)

    const { legSeverity } = detectTripConflicts({
      days: [day],
      itemsFor: () => [museo, comida],
      arrivalsFor: () => [],
      dateByDayId: new Map([[DAY_ID, DATE]]),
      zones: noZones,
      legs: new Map([[key, leg(30)]]),
      today: '2026-05-01',
    })
    expect(legSeverity.get(key)).toBe('error')
  })

  it('un día sin nada no genera conflictos', () => {
    expect(run([])).toEqual([])
  })
})
