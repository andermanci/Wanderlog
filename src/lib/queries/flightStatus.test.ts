import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flightStatusIsRelevant } from './flightStatus'

// Cada consulta gasta cuota de la capa gratuita del proveedor, así que la
// ventana es lo que impide que abrir un viaje de dentro de tres meses dispare
// una petición por cada vuelo del itinerario.
describe('flightStatusIsRelevant', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Casi medianoche: "hoy" tiene que seguir siendo hoy a las 23:50.
    vi.setSystemTime(new Date('2026-07-21T23:50:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('consulta el día del vuelo aunque queden minutos para el cambio de día', () => {
    expect(flightStatusIsRelevant('2026-07-21')).toBe(true)
  })

  it('consulta ayer, mañana y pasado', () => {
    expect(flightStatusIsRelevant('2026-07-20')).toBe(true)
    expect(flightStatusIsRelevant('2026-07-22')).toBe(true)
    expect(flightStatusIsRelevant('2026-07-23')).toBe(true)
  })

  it('no consulta vuelos lejanos: el proveedor no tiene el dato todavía', () => {
    expect(flightStatusIsRelevant('2026-07-24')).toBe(false)
    expect(flightStatusIsRelevant('2026-10-01')).toBe(false)
  })

  it('no consulta vuelos ya pasados', () => {
    expect(flightStatusIsRelevant('2026-07-19')).toBe(false)
    expect(flightStatusIsRelevant('2026-01-01')).toBe(false)
  })

  it('sin fecha no consulta', () => {
    expect(flightStatusIsRelevant(null)).toBe(false)
    expect(flightStatusIsRelevant(undefined)).toBe(false)
    expect(flightStatusIsRelevant('')).toBe(false)
  })
})
