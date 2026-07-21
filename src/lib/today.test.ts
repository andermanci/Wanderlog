import { describe, it, expect } from 'vitest'
import { buildDay, focusEntry, toMin } from './today'
import type { Activity } from '@/types/database'

const act = (p: Partial<Activity>): Activity => ({
  id: p.id ?? 'a', trip_id: 't', day_id: 'd', title: p.title ?? 'X', type: 'activity',
  order_index: 0, start_time: null, end_time: null, done: false,
  ...p,
} as Activity)

// 12:00
const NOON = 12 * 60

describe('buildDay', () => {
  it('marca en curso lo que abarca la hora actual y calcula lo que queda', () => {
    const [e] = buildDay([act({ start_time: '11:00', end_time: '13:00' })], NOON)
    expect(e.state).toBe('current')
    expect(e.relative).toBe('quedan 1 h')
    expect(e.progress).toBeCloseTo(0.5)
  })

  it('cuenta lo que falta para lo que aún no ha empezado', () => {
    const [e] = buildDay([act({ start_time: '12:45' })], NOON)
    expect(e.state).toBe('upcoming')
    expect(e.relative).toBe('en 45 min')
    expect(e.progress).toBeNull()
  })

  it('da por pasado lo que ya terminó', () => {
    const [e] = buildDay([act({ start_time: '09:00', end_time: '10:30' })], NOON)
    expect(e.state).toBe('past')
    expect(e.relative).toBe('')
  })

  it('sin hora de fin, pasa a pasado en cuanto arranca', () => {
    // Una cena sin hora de fin no puede quedarse "en curso" el resto del día.
    expect(buildDay([act({ start_time: '11:59' })], NOON)[0].state).toBe('past')
    expect(buildDay([act({ start_time: '12:01' })], NOON)[0].state).toBe('upcoming')
  })

  it('lo marcado como hecho cuenta como pasado aunque su hora no haya llegado', () => {
    const [e] = buildDay([act({ start_time: '23:00', done: true })], NOON)
    expect(e.state).toBe('past')
  })

  it('una actividad que cruza medianoche no genera progreso ni duración negativa', () => {
    // 23:00 → 01:00: restar a pelo daría -22 h y una barra al revés.
    const [e] = buildDay([act({ start_time: '23:00', end_time: '01:00' })], NOON)
    expect(e.progress).toBeNull()
    expect(e.state).toBe('upcoming')
    expect(e.relative).toBe('en 11 h')
  })

  it('lo que no tiene hora queda pendiente, nunca pasado por el reloj', () => {
    const [e] = buildDay([act({ start_time: null })], NOON)
    expect(e.state).toBe('upcoming')
    expect(e.relative).toBe('')
  })
})

describe('focusEntry', () => {
  const acts = [
    act({ id: '1', start_time: '09:00', end_time: '10:00' }),
    act({ id: '2', start_time: '11:00', end_time: '13:00' }),
    act({ id: '3', start_time: '18:00' }),
  ]

  it('manda lo que está en curso', () => {
    expect(focusEntry(buildDay(acts, NOON))?.activity.id).toBe('2')
  })

  it('si no hay nada en curso, la siguiente', () => {
    // 14:00: la de 11-13 ya pasó, toca la de las 18:00.
    expect(focusEntry(buildDay(acts, 14 * 60))?.activity.id).toBe('3')
  })

  it('con el día terminado, la última, para no dejar el hueco vacío', () => {
    expect(focusEntry(buildDay(acts, 23 * 60))?.activity.id).toBe('3')
  })

  it('sin actividades no hay foco', () => {
    expect(focusEntry([])).toBeNull()
  })
})

describe('toMin', () => {
  it('acepta HH:MM y HH:MM:SS', () => {
    expect(toMin('07:30')).toBe(450)
    expect(toMin('07:30:00')).toBe(450)
  })
})
