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

  // Lo que ya se escucha en la audioguía de cada actividad no debe repetirse en
  // la del día: por eso las actividades entran PROHIBIDAS, no como recorrido.
  it('las visitas del día entran como lista de exclusión', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [
      actividad('Palacio Ducal', 'Piazza San Marco, 1'),
      actividad('Basílica de San Marcos'),
    ])
    expect(prompt).toContain('de estos sitios NO debes hablar')
    expect(prompt).toContain('- Palacio Ducal')
    expect(prompt).toContain('- Basílica de San Marcos')
    expect(prompt).toContain('No les dediques un capítulo')
  })

  // La dirección de la actividad sobra en una lista de exclusión y encima
  // arrastraría nombres de sitios ("Piazza San Marco") que no queremos sugerir.
  it('en la exclusión va el nombre a secas, sin la dirección', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [
      actividad('Palacio Ducal', 'Piazza San Marco, 1'),
    ])
    expect(prompt).not.toContain('Piazza San Marco, 1')
  })

  it('no habla de exclusiones si el día está vacío', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).not.toContain('NO debes hablar')
  })

  it('cada nivel de detalle pide un número de capítulos distinto', () => {
    const d = dia([{ name: 'Venecia', guide_id: null }])
    expect(buildDayAudioguidePrompt(d, trip, [], 'rapida')).toContain('entre 5 y 7 capítulos')
    expect(buildDayAudioguidePrompt(d, trip, [], 'estandar')).toContain('entre 10 y 14 capítulos')
    expect(buildDayAudioguidePrompt(d, trip, [], 'exhaustiva')).toContain('18 capítulos o más')
  })

  // Al contrario que antes: son temas, no sitios, así que por defecto no hay
  // ubicación — y sin paradas localizadas el reproductor no ofrece mapa.
  it('pide NINGUNO en la ubicación salvo excepción', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).toContain('escribe NINGUNO en las dos líneas')
    expect(prompt).toContain('Cada capítulo es un TEMA, no un sitio')
  })

  it('ya no encarga un recorrido a pie', () => {
    const prompt = buildDayAudioguidePrompt(dia([{ name: 'Venecia', guide_id: null }]), trip, [])
    expect(prompt).not.toContain('recorrido a pie')
    expect(prompt).not.toContain('sentido geográfico')
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
