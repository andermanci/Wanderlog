import { describe, it, expect } from 'vitest'
import { wallToUtcMs, tzOffsetMinutes, comparableZones, formatDuration } from './timezone'

const minutesBetween = (
  from: [string, string, string | null],
  to: [string, string, string | null],
) => (wallToUtcMs(...to) - wallToUtcMs(...from)) / 60_000

describe('wallToUtcMs', () => {
  it('calcula la duración real de un vuelo que cruza husos', () => {
    // Lo que pone el billete: sale de Madrid a las 12:00, llega a Tokio a las
    // 08:30 del día siguiente. Restar a pelo daría "20 h 30" o "-3 h 30" según
    // cómo se mire; la duración real son 12 h 30.
    // Madrid 12:00 CET = 11:00 UTC · Tokio 08:30 JST del día 13 = 23:30 UTC del 12.
    const vuelo = minutesBetween(
      ['2026-03-12', '12:00', 'Europe/Madrid'],
      ['2026-03-13', '08:30', 'Asia/Tokyo'],
    )
    expect(vuelo).toBe(12 * 60 + 30)
  })

  it('la vuelta llega el MISMO día a una hora que parece imposible', () => {
    // Tokio 11:00 → Madrid 17:05 del mismo día. Parece que dura 6 h; son 14 h 05.
    // Es justo el caso que desconcierta al usuario, y por eso hay que mostrar
    // la duración calculada y la coletilla "horas locales de cada ciudad".
    const vuelta = minutesBetween(
      ['2026-03-20', '11:00', 'Asia/Tokyo'],
      ['2026-03-20', '17:05', 'Europe/Madrid'],
    )
    expect(vuelta).toBe(14 * 60 + 5)
  })

  it('cruza la línea de cambio de fecha', () => {
    // Los Ángeles → Tokio: sale el día 1, llega el día 3 (se pierde un día).
    const vuelo = minutesBetween(
      ['2026-06-01', '11:30', 'America/Los_Angeles'],
      ['2026-06-02', '15:20', 'Asia/Tokyo'],
    )
    expect(vuelo).toBe(11 * 60 + 50)
  })

  it('sin zona, compara horas de pared (viaje de una sola ciudad)', () => {
    const gap = minutesBetween(
      ['2026-03-12', '10:00', null],
      ['2026-03-12', '12:30', null],
    )
    expect(gap).toBe(150)
  })

  it('el resultado no depende de la zona de la máquina', () => {
    // El módulo no puede usar new Date(y,m,d) ni getTimezoneOffset(): si lo
    // hiciera, este valor cambiaría según el TZ del runner.
    expect(wallToUtcMs('2026-03-12', '12:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 2, 12, 11, 0))
    expect(wallToUtcMs('2026-01-12', '12:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 0, 12, 11, 0))
  })
})

describe('horario de verano', () => {
  it('aplica el offset de invierno y el de verano en Madrid', () => {
    // 2026: el cambio es el 29 de marzo. Antes CET (+1), después CEST (+2).
    expect(tzOffsetMinutes('Europe/Madrid', Date.UTC(2026, 2, 1))).toBe(60)
    expect(tzOffsetMinutes('Europe/Madrid', Date.UTC(2026, 3, 1))).toBe(120)
  })

  it('un vuelo la noche del cambio de hora dura una hora menos de lo que parece', () => {
    // La madrugada del 29/03 los relojes saltan de 02:00 a 03:00 en Madrid.
    // Salir a las 01:00 y "llegar" a las 05:00 son 3 h reales, no 4.
    const vuelo = minutesBetween(
      ['2026-03-29', '01:00', 'Europe/Madrid'],
      ['2026-03-29', '05:00', 'Europe/Madrid'],
    )
    expect(vuelo).toBe(180)
  })

  it('resuelve una hora de pared que no existe (el hueco del cambio)', () => {
    // Las 02:30 del 29/03 no existen en Madrid. Se resuelve a las 03:30 locales
    // (= 01:30 UTC). Ninguna aerolínea programa salidas en horas inexistentes,
    // pero el algoritmo no debe devolver NaN ni disparatar.
    const ms = wallToUtcMs('2026-03-29', '02:30', 'Europe/Madrid')
    expect(ms).toBe(Date.UTC(2026, 2, 29, 1, 30))
  })
})

describe('comparableZones', () => {
  it('compara dos marcos conocidos, o dos desconocidos', () => {
    expect(comparableZones('Europe/Madrid', 'Asia/Tokyo')).toBe(true)
    expect(comparableZones(null, null)).toBe(true)
  })

  it('calla si mezcla un marco conocido con uno desconocido', () => {
    expect(comparableZones('Europe/Madrid', null)).toBe(false)
    expect(comparableZones(null, 'Asia/Tokyo')).toBe(false)
  })
})

describe('formatDuration', () => {
  it('formatea en horas y minutos', () => {
    expect(formatDuration(810)).toBe('13 h 30 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('devuelve vacío si no hay duración que mostrar', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(-30)).toBe('')
    expect(formatDuration(NaN)).toBe('')
  })
})
