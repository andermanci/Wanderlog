import { describe, it, expect } from 'vitest'
import { buildAudioguidePrompt, buildDayAudioguidePrompt, detailLevelsFor } from './buildPrompt'
import { parseAudioguideText } from './parseAudioguideText'
import type { Activity, ItineraryDay, Trip } from '@/types/database'

const trip = { id: 't1', destination: 'Italia', cover_image_url: null } as Trip

const dia = (cities: { name: string; guide_id: string | null }[] = []) =>
  ({ id: 'd1', trip_id: 't1', date: '2026-08-13', cities } as ItineraryDay)

const actividad = (title: string, address: string | null = null) =>
  ({ id: `a-${title}`, day_id: 'd1', title, address, type: 'activity' } as Activity)

describe('buildDayAudioguidePrompt', () => {
  it('el sujeto es la ciudad del día, no el destino del viaje', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).toContain('la ciudad de Venecia')
    expect(prompt).toContain('Italia')
  })

  it('junta las ciudades cuando el día tiene varias', () => {
    const prompt = buildDayAudioguidePrompt(
      dia([{ name: 'Roma', guide_id: null }, { name: 'Tívoli', guide_id: null }]), trip, [],
    )
    expect(prompt).toContain('la ciudad de Roma y Tívoli')
  })

  // Un día sin ciudades escritas es lo normal recién creado el viaje: más vale
  // una audioguía del destino que ninguna.
  it('cae al destino del viaje si el día no dice dónde estás', () => {
    expect(buildDayAudioguidePrompt(dia(), trip, [])).toContain('la ciudad de Italia')
  })

  it('pasa las visitas del día para encajar el recorrido y no repetirlas', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [
      actividad('Palacio Ducal', 'Piazza San Marco, 1'),
      actividad('Basílica de San Marcos'),
    ])
    expect(prompt).toContain('- Palacio Ducal (Piazza San Marco, 1)')
    expect(prompt).toContain('- Basílica de San Marcos')
    expect(prompt).toContain('SIN entrar en detalle en su interior')
  })

  it('no menciona visitas si el día está vacío', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).not.toContain('ya tengo previstas')
  })

  it('cada nivel de detalle pide un número de paradas distinto', () => {
    const d = dia([{ name: 'Venecia', guide_id: null }])
    expect(buildDayAudioguidePrompt(d, trip, [], 'rapida')).toContain('entre 5 y 7 paradas')
    expect(buildDayAudioguidePrompt(d, trip, [], 'estandar')).toContain('entre 10 y 14 paradas')
    expect(buildDayAudioguidePrompt(d, trip, [], 'exhaustiva')).toContain('18 paradas o más')
  })

  // El prompt de ciudad recorre la calle: casi toda parada es un sitio real y
  // debe traer coordenadas, al revés que el de museo (salas sin ubicación).
  it('pide coordenadas siempre que se pueda, no como excepción', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).toContain('rellena los dos campos siempre que puedas')
  })
})

describe('detailLevelsFor', () => {
  it('describe las intensidades distinto para un museo y para una ciudad', () => {
    const sitio = detailLevelsFor('activity')
    const ciudad = detailLevelsFor('day')
    expect(sitio.map(l => l.id)).toEqual(ciudad.map(l => l.id))
    expect(sitio[0].description).not.toBe(ciudad[0].description)
  })
})

// El bloque de formato de salida está compartido por los dos prompts, así que
// un cambio en él rompería el parseo de los dos a la vez. Esto lo fija.
describe('contrato de formato con parseAudioguideText', () => {
  const respuesta = `###PARADA###
TITULO: Puente de Rialto
RESUMEN: El puente más antiguo sobre el Gran Canal y el corazón comercial de la ciudad.
DIRECCION: Desde la parada anterior, sigue las indicaciones a Rialto por la Salizada.
LUGAR: Puente de Rialto, Venecia
COORDENADAS: 45.43803, 12.33593
GUION: Estás sobre el Rialto, donde durante siglos se decidió el precio de la pimienta.
###FIN###
###PARADA###
TITULO: Introducción
RESUMEN: Qué vas a entender durante el paseo.
DIRECCION: Empieza donde estés.
LUGAR: NINGUNO
COORDENADAS: NINGUNO
GUION: Venecia no debería existir, y ese es justo el motivo por el que existe.
###FIN###`

  it('los dos prompts describen el mismo formato', () => {
    const dePueblo = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    const deSitio = buildAudioguidePrompt(actividad('Palacio Ducal'), trip)
    for (const prompt of [dePueblo, deSitio]) {
      expect(prompt).toContain('###PARADA###')
      expect(prompt).toContain('###FIN###')
      expect(prompt).toContain('COORDENADAS: <latitud, longitud>')
    }
  })

  it('una respuesta con ese formato se parsea entera', () => {
    const paradas = parseAudioguideText(respuesta)
    expect(paradas).toHaveLength(2)
    expect(paradas[0].title).toBe('Puente de Rialto')
    expect(paradas[0].coords).toEqual({ lat: 45.43803, lng: 12.33593 })
    expect(paradas[0].placeQuery).toBe('Puente de Rialto, Venecia')
    // NINGUNO es la respuesta pactada para "esto no es un sitio del mapa".
    expect(paradas[1].coords).toBeNull()
    expect(paradas[1].placeQuery).toBeNull()
  })
})
