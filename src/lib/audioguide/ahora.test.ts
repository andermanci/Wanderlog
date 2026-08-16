import { describe, it, expect } from 'vitest'
import { audioguiaDeAhora } from './ahora'
import type { DayEntry } from '@/lib/today'
import type { Activity, ItineraryDay } from '@/types/database'

const dia = { id: 'd1', trip_id: 't1', date: '2026-08-16' } as ItineraryDay

const entrada = (
  id: string,
  title: string,
  state: DayEntry['state'] = 'current',
  relative = '',
): DayEntry => ({
  activity: { id, title } as Activity,
  state,
  relative,
  progress: null,
})

describe('audioguiaDeAhora', () => {
  it('prefiere la audioguía de lo que estás haciendo ahora', () => {
    const r = audioguiaDeAhora(
      { activityIds: ['a1'], dayIds: ['d1'] },
      entrada('a1', 'Galleria degli Uffizi', 'current', 'quedan 1 h'),
      dia,
    )
    expect(r?.scope).toEqual({ kind: 'activity', id: 'a1' })
    expect(r?.titulo).toBe('Galleria degli Uffizi')
    expect(r?.pie).toBe('quedan 1 h')
  })

  it('cae a la de la ciudad si la actividad no tiene la suya', () => {
    const r = audioguiaDeAhora(
      { activityIds: ['otra'], dayIds: ['d1'] },
      entrada('a1', 'Comer en el Oltrarno'),
      dia,
    )
    expect(r?.scope).toEqual({ kind: 'day', id: 'd1' })
    expect(r?.titulo).toBe('La ciudad de hoy')
  })

  it('también da la de la ciudad cuando no hay nada en curso', () => {
    const r = audioguiaDeAhora({ activityIds: [], dayIds: ['d1'] }, null, dia)
    expect(r?.scope).toEqual({ kind: 'day', id: 'd1' })
  })

  // En mitad de un viaje, un enlace a «genera esto» estorba más que ayuda.
  it('no ofrece nada si no hay ninguna generada', () => {
    expect(audioguiaDeAhora({ activityIds: [], dayIds: [] }, entrada('a1', 'X'), dia)).toBeNull()
    expect(audioguiaDeAhora(undefined, entrada('a1', 'X'), dia)).toBeNull()
  })

  // Solo cuentan las que están LISTAS: una a medio generar no se puede escuchar.
  it('ignora la actividad si su audioguía no está lista', () => {
    const r = audioguiaDeAhora({ activityIds: [], dayIds: ['d1'] }, entrada('a1', 'X'), dia)
    expect(r?.scope.kind).toBe('day')
  })

  it('sin día de hoy y sin actividad, no hay nada que ofrecer', () => {
    expect(audioguiaDeAhora({ activityIds: [], dayIds: ['d1'] }, null, undefined)).toBeNull()
  })

  describe('pie de la actividad', () => {
    it('usa el texto relativo que ya calcula focusEntry', () => {
      const r = audioguiaDeAhora({ activityIds: ['a1'], dayIds: [] }, entrada('a1', 'X', 'upcoming', 'en 45 min'), dia)
      expect(r?.pie).toBe('en 45 min')
    })

    it('si no hay texto relativo, distingue en curso de lo siguiente', () => {
      expect(audioguiaDeAhora({ activityIds: ['a1'], dayIds: [] }, entrada('a1', 'X', 'current'), dia)?.pie)
        .toBe('Ahora mismo')
      expect(audioguiaDeAhora({ activityIds: ['a1'], dayIds: [] }, entrada('a1', 'X', 'upcoming'), dia)?.pie)
        .toBe('A continuación')
    })
  })

  // La caché persistida en localStorage puede traer todavía la forma vieja.
  it('entiende el valor cacheado antiguo (un array de ids de actividad)', () => {
    const r = audioguiaDeAhora(['a1'], entrada('a1', 'Murano'), dia)
    expect(r?.scope).toEqual({ kind: 'activity', id: 'a1' })
  })

  it('con la forma vieja no inventa audioguía de día', () => {
    expect(audioguiaDeAhora(['otra'], entrada('a1', 'X'), dia)).toBeNull()
  })
})
