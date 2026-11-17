import { describe, it, expect } from 'vitest'
import type { Activity, ItineraryDay, SnapshotActivity, VersionTransit } from '@/types/database'
import { hotelFor, itemsOn, sequenceOn, toLiveSnapshot } from './snapshot'
import { indexTransit, legsOn } from './transit'
import { diffItineraries, totalsOf } from './diff'
import { dayMetrics, versionMetrics } from './metrics'

const DATES = ['2026-11-21', '2026-11-22', '2026-11-23']

let seq = 0
const snap = (a: Partial<SnapshotActivity> & { id: string; date: string }): SnapshotActivity => ({
  type: 'place', title: a.id, description: null, address: null,
  start_time: null, end_time: null, price: null, external_link: null, notes: null,
  order_index: ++seq, place_id: null, origin: null, destination: null,
  lat: null, lng: null, origin_lat: null, origin_lng: null,
  destination_lat: null, destination_lng: null, cover_image_url: null,
  day_orders: {}, done: false, created_at: '',
  origin_tz: null, destination_tz: null, fixed_time: false, end_date: null,
  ...a,
})

// Un hotel de tres noches en Shinjuku y visitas en Asakusa (este) y Shibuya (oeste).
const HOTEL = snap({ id: 'h', type: 'hotel', date: '2026-11-20', end_date: '2026-11-24', lat: 35.6863, lng: 139.6927,
  day_orders: { '2026-11-21': 0 } })
const ASAKUSA = { lat: 35.7148, lng: 139.7967 }
const SHIBUYA = { lat: 35.6595, lng: 139.7005 }

describe('toLiveSnapshot', () => {
  it('cambia ids de día por fechas, también en day_orders', () => {
    const days = [
      { id: 'd20', date: '2026-11-20' }, { id: 'd21', date: '2026-11-21' }, { id: 'd24', date: '2026-11-24' },
    ] as ItineraryDay[]
    const hotel = {
      ...HOTEL, trip_id: 't', day_id: 'd20', end_day_id: 'd24', day_orders: { d21: 3, desconocido: 1 },
    } as unknown as Activity
    const [s] = toLiveSnapshot([hotel], days)
    expect(s.date).toBe('2026-11-20')
    expect(s.end_date).toBe('2026-11-24')
    expect(s.day_orders).toEqual({ '2026-11-21': 3 })
    expect('day_id' in s).toBe(false)
  })
})

describe('itemsOn / hotelFor', () => {
  it('ordena por order_index y deja fuera el hotel', () => {
    const v = [HOTEL, snap({ id: 'b', date: DATES[0], order_index: 2 }), snap({ id: 'a', date: DATES[0], order_index: 1 })]
    expect(itemsOn(v, DATES[0]).map(x => x.id)).toEqual(['a', 'b'])
  })
  it('el hotel de una noche es el que cubre esa fecha (la noche de salida no)', () => {
    expect(hotelFor([HOTEL], '2026-11-23')?.id).toBe('h')
    expect(hotelFor([HOTEL], '2026-11-24')).toBeNull()
  })
})

describe('diffItineraries', () => {
  const A = [
    HOTEL,
    snap({ id: 'senso', date: DATES[0], start_time: '09:00:00', order_index: 0 }),
    snap({ id: 'shibuya', date: DATES[0], order_index: 1 }),
    snap({ id: 'meiji', date: DATES[1], start_time: '09:00:00', order_index: 0 }),
    snap({ id: 'roppongi', date: DATES[1], order_index: 1 }),
  ]
  const B = [
    HOTEL,
    snap({ id: 'senso', date: DATES[0], start_time: '09:00:00', order_index: 0 }),
    snap({ id: 'meiji', date: DATES[1], start_time: '08:30:00', order_index: 0 }),
    snap({ id: 'shibuya', date: DATES[1], start_time: '16:00:00', order_index: 1 }),
    snap({ id: 'odawara', date: DATES[2], order_index: 0 }),
  ]
  const diff = diffItineraries(A, B, DATES)

  it('marca lo que cambia de día, de hora, lo nuevo y lo quitado', () => {
    const [d21, d22, d23] = diff
    expect(d21.b.map(c => c.kind)).toEqual(['same'])
    expect(d21.movedOut).toEqual([{ activity: A[2], toDate: DATES[1] }])
    expect(d22.b.map(c => [c.activity.id, c.kind])).toEqual([['meiji', 'time'], ['shibuya', 'moved']])
    expect(d22.b[0].fromTime).toBe('09:00')
    expect(d22.b[1].fromDate).toBe(DATES[0])
    expect(d22.removed.map(r => r.id)).toEqual(['roppongi'])
    expect(d23.b.map(c => c.kind)).toEqual(['added'])
  })

  it('cuenta los cambios por día y en total', () => {
    expect(diff.map(d => d.changes)).toEqual([1, 3, 1])
    expect(totalsOf(diff)).toEqual({ moved: 1, time: 1, added: 1, removed: 1, placed: 0, transit: 0, daysChanged: 3 })
  })

  it('un día con lo mismo en otro orden cuenta como un cambio', () => {
    const x = [snap({ id: 'p', date: DATES[0], order_index: 0 }), snap({ id: 'q', date: DATES[0], order_index: 1 })]
    const y = [{ ...x[0], order_index: 1 }, { ...x[1], order_index: 0 }]
    const [d] = diffItineraries(x, y, [DATES[0]])
    expect(d.reordered).toBe(true)
    expect(d.changes).toBe(1)
    expect(diffItineraries(x, x, [DATES[0]])[0].changes).toBe(0)
  })
})

describe('métricas', () => {
  it('un día que cruza la ciudad suma más km que uno por zonas', () => {
    const zigzag = [HOTEL,
      snap({ id: '1', date: DATES[0], order_index: 0, ...ASAKUSA }),
      snap({ id: '2', date: DATES[0], order_index: 1, ...SHIBUYA }),
      snap({ id: '3', date: DATES[0], order_index: 2, ...ASAKUSA })]
    const zona = [HOTEL,
      snap({ id: '1', date: DATES[0], order_index: 0, ...ASAKUSA }),
      snap({ id: '3', date: DATES[0], order_index: 1, ...ASAKUSA })]
    expect(dayMetrics(zigzag, DATES[0], null).km).toBeGreaterThan(dayMetrics(zona, DATES[0], null).km + 15)
  })

  it('no cuenta los saltos entre ciudades ni la hora de los vuelos', () => {
    const v = [
      snap({ id: 'vuelo', type: 'flight', date: DATES[0], start_time: '02:25:00', order_index: 0 }),
      snap({ id: 'tren', type: 'transport', date: DATES[0], start_time: '08:11:00', end_time: '23:50:00', order_index: 1 }),
      snap({ id: 'kioto', date: DATES[0], start_time: '19:30:00', order_index: 2, lat: 35.0, lng: 135.77 }),
      snap({ id: 'kioto2', date: DATES[0], order_index: 3, lat: 35.01, lng: 135.78 }),
    ]
    const m = dayMetrics(v, DATES[0], null)
    expect(m.start).toBe('08:11')
    expect(m.end).toBe('19:30')
    expect(m.late).toBe(false)
    expect(m.km).toBeLessThan(2)
    expect(m.visits).toBe(2)
  })

  it('resume la versión: días que acaban tarde y hora media de inicio', () => {
    const v = [
      snap({ id: 'a', date: DATES[0], start_time: '08:00:00' }),
      snap({ id: 'b', date: DATES[0], start_time: '21:00:00' }),
      snap({ id: 'c', date: DATES[1], start_time: '09:00:00' }),
    ]
    const m = versionMetrics(v, DATES)
    expect(m.lateDays).toBe(1)
    expect(m.avgStart).toBe('08:30')
    expect(m.visits).toBe(3)
  })
})

describe('trayectos y ubicaciones entre versiones', () => {
  const D = '2026-11-21'
  const hotel = snap({ id: 'h', type: 'hotel', date: '2026-11-20', end_date: '2026-11-24', lat: 35.6863, lng: 139.6927, day_orders: { [D]: 9 } })
  const senso = snap({ id: 'senso', date: D, order_index: 0, ...ASAKUSA })
  const shibuya = snap({ id: 'shibuya', date: D, order_index: 1, ...SHIBUYA })
  const route = (from: SnapshotActivity, to: SnapshotActivity, line: string, total = 40): VersionTransit => ({
    from_activity_id: from.id, to_activity_id: to.id,
    coords_sig: `${from.lat!.toFixed(4)},${from.lng!.toFixed(4)}|${to.lat!.toFixed(4)},${to.lng!.toFixed(4)}`,
    worth_it: true, total_minutes: total, summary: line, fare_text: null, note: null, skip_reason: null, alternative: null, generated_at: '',
    steps: [{ kind: 'walk', minutes: 4 }, { kind: 'metro', line, minutes: 30, from_station: 'A', to_station: 'B' }] as VersionTransit['steps'],
  })

  it('la secuencia del día intercala el hotel donde lo tenga puesto', () => {
    expect(sequenceOn([hotel, shibuya, senso], D).map(a => a.id)).toEqual(['senso', 'shibuya', 'h'])
    expect(sequenceOn([{ ...hotel, day_orders: { [D]: -1 } }, senso], D).map(a => a.id)).toEqual(['h', 'senso'])
  })

  it('una ruta solo vale si los extremos siguen donde estaban', () => {
    const routes = indexTransit([route(senso, shibuya, 'Ginza Line')])
    expect(legsOn([senso, shibuya], routes, D)[0].route?.summary).toBe('Ginza Line')
    const moved = { ...shibuya, lat: 35.6700 }
    expect(legsOn([senso, moved], routes, D)[0].route).toBeNull()
  })

  it('cuenta rutas nuevas, distintas y la ubicación corregida', () => {
    const a = [hotel, senso, shibuya]
    const sensoFixed = { ...senso, lat: 35.7186 }
    const b = [hotel, sensoFixed, shibuya]
    const tA = [route(senso, shibuya, 'Ginza Line')]
    const tB = [route(sensoFixed, shibuya, 'Asakusa Line'), route(shibuya, hotel, 'JR Yamanote Line', 23)]
    const [day] = diffItineraries(a, b, [D], tA, tB)
    expect([...day.transit.changes.values()].sort()).toEqual(['changed', 'new'])
    expect(day.b.find(c => c.activity.id === 'senso')?.place).toBeGreaterThan(400)
    expect(day.changes).toBe(3)
    expect(totalsOf([day])).toMatchObject({ placed: 1, transit: 2 })
  })

  it('si un lado no sabe de trayectos, no se cuentan como cambios', () => {
    const [day] = diffItineraries([senso, shibuya], [senso, shibuya], [D], null, [route(senso, shibuya, 'Ginza Line')])
    expect(day.changes).toBe(0)
    expect(day.transit.b[0].route).not.toBeNull()
  })
})
