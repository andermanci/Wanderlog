import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  esRutaRecordable, guardarRuta, guardarScroll, tocarRuta,
  rutaAlArrancar, tomarScrollPendiente,
  guardarPosicionAudio, leerPosicionAudio,
} from './resumeState'

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('esRutaRecordable', () => {
  it('recuerda las pantallas donde se está', () => {
    expect(esRutaRecordable('/dashboard')).toBe(true)
    expect(esRutaRecordable('/trips/t1/itinerary/a1/audioguide')).toBe(true)
    expect(esRutaRecordable('/trips/t1/expenses?mes=8')).toBe(true)
  })

  it('no recuerda el arranque ni las públicas de acceso', () => {
    expect(esRutaRecordable('/')).toBe(false)
    expect(esRutaRecordable('/login')).toBe(false)
    expect(esRutaRecordable('/auth/callback')).toBe(false)
  })

  it('no recuerda destinos de enlace externo: sin sus parámetros no llevan a nada', () => {
    expect(esRutaRecordable('/import/shared?url=x')).toBe(false)
    expect(esRutaRecordable('/invite/abc123')).toBe(false)
  })

  it('no recuerda formularios ni el panel de administración', () => {
    expect(esRutaRecordable('/trips/t1/itinerary/new')).toBe(false)
    expect(esRutaRecordable('/trips/t1/itinerary/a1/edit')).toBe(false)
    expect(esRutaRecordable('/admin/usuarios/u1')).toBe(false)
  })
})

describe('rutaAlArrancar', () => {
  it('devuelve la última ruta si es reciente', () => {
    guardarRuta('/trips/t1/itinerary')
    expect(rutaAlArrancar()).toBe('/trips/t1/itinerary')
  })

  it('no devuelve nada sin ruta guardada', () => {
    expect(rutaAlArrancar()).toBeNull()
  })

  it('caduca a la media hora de salir de la app', () => {
    vi.useFakeTimers()
    guardarRuta('/trips/t1/itinerary')
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(rutaAlArrancar()).toBeNull()
  })

  it('tocarRuta reinicia la cuenta: media hora en la misma pantalla no te deja fuera', () => {
    vi.useFakeTimers()
    guardarRuta('/trips/t1/itinerary')
    vi.advanceTimersByTime(25 * 60 * 1000)
    tocarRuta()
    vi.advanceTimersByTime(25 * 60 * 1000)
    expect(rutaAlArrancar()).toBe('/trips/t1/itinerary')
  })
})

describe('scroll', () => {
  it('se recupera una sola vez y solo para su ruta', () => {
    guardarRuta('/trips/t1/itinerary')
    guardarScroll('/trips/t1/itinerary', 640)
    expect(rutaAlArrancar()).toBe('/trips/t1/itinerary')
    expect(tomarScrollPendiente('/dashboard')).toBeNull()
    expect(tomarScrollPendiente('/trips/t1/itinerary')).toBe(640)
    // Consumido: una navegación normal posterior debe empezar arriba.
    expect(tomarScrollPendiente('/trips/t1/itinerary')).toBeNull()
  })

  it('ignora el scroll de una ruta que ya se abandonó', () => {
    guardarRuta('/trips/t1/itinerary')
    guardarScroll('/dashboard', 900)
    rutaAlArrancar()
    expect(tomarScrollPendiente('/trips/t1/itinerary')).toBeNull()
  })
})

describe('posición de audioguía', () => {
  it('guarda y recupera parada y segundo por audioguía', () => {
    guardarPosicionAudio('ag-1', 'stop-3', 87.5)
    guardarPosicionAudio('ag-2', 'stop-1', 12)
    expect(leerPosicionAudio('ag-1')).toEqual({ stopId: 'stop-3', seconds: 87.5 })
    expect(leerPosicionAudio('ag-2')).toEqual({ stopId: 'stop-1', seconds: 12 })
    expect(leerPosicionAudio('ag-3')).toBeNull()
  })

  it('aguanta un día, no media hora: retomar una parada mañana es lo esperable', () => {
    vi.useFakeTimers()
    guardarPosicionAudio('ag-1', 'stop-3', 87.5)
    vi.advanceTimersByTime(20 * 60 * 60 * 1000)
    expect(leerPosicionAudio('ag-1')).toEqual({ stopId: 'stop-3', seconds: 87.5 })
    vi.advanceTimersByTime(5 * 60 * 60 * 1000)
    expect(leerPosicionAudio('ag-1')).toBeNull()
  })
})
