import { describe, it, expect } from 'vitest'
import { parseIcs, activityTypeFor } from './parseIcs'

// .ics con la forma de los que manda una aerolínea: líneas plegadas a 75
// octetos, comas escapadas y el localizador metido en la descripción.
const VUELO = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Iberia//ES
BEGIN:VEVENT
UID:IB3106-20260512@iberia.com
SUMMARY:Vuelo IB3106 Madrid - Tokio
DTSTART:20260512T100000Z
DTEND:20260512T230000Z
LOCATION:Aeropuerto Adolfo Suárez Madrid-Barajas (MAD)
DESCRIPTION:Localizador: ABC123\\nAsiento 24A\\, ventanilla.\\nFactura tu equi
 paje 2 horas antes.
END:VEVENT
END:VCALENDAR`

const HOTEL = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:booking-998877
SUMMARY:Hotel Shinjuku Granbell
DTSTART;VALUE=DATE:20260513
DTEND;VALUE=DATE:20260518
LOCATION:2-14-5 Kabukicho\\, Shinjuku\\, Tokio
DESCRIPTION:Booking reference: 9988776655
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('lee un vuelo con su localizador y su trayecto', () => {
    const [vuelo] = parseIcs(VUELO)

    expect(vuelo.category).toBe('flight')
    expect(vuelo.title).toBe('Vuelo IB3106 Madrid - Tokio')
    expect(vuelo.locator).toBe('ABC123')
    expect(vuelo.provider).toBe('IB3106')
    expect(vuelo.origin).toBe('Madrid')
    expect(vuelo.destination).toBe('Tokio')
    expect(vuelo.allDay).toBe(false)
    expect(vuelo.start).toBe('2026-05-12T10:00:00.000Z')
    expect(vuelo.end).toBe('2026-05-12T23:00:00.000Z')
  })

  it('deshace el plegado de líneas y el escapado de comas', () => {
    const [vuelo] = parseIcs(VUELO)
    // La descripción venía partida a mitad de "equipaje" y con "24A\, ventanilla".
    expect(vuelo.notes).toContain('Asiento 24A, ventanilla.')
    expect(vuelo.notes).toContain('Factura tu equipaje 2 horas antes.')
  })

  it('lee un hotel de varias noches como evento de día completo', () => {
    const [hotel] = parseIcs(HOTEL)

    expect(hotel.category).toBe('hotel')
    expect(hotel.allDay).toBe(true)
    expect(hotel.locator).toBe('9988776655')
    expect(hotel.location).toBe('2-14-5 Kabukicho, Shinjuku, Tokio')
    // Un hotel no tiene trayecto: no debe inventarse un origen y un destino
    // partiendo el nombre por el guion.
    expect(hotel.origin).toBeNull()
    expect(hotel.destination).toBeNull()
  })

  it('clasifica por palabras clave en español y en inglés', () => {
    const ics = (summary: string) => `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:x
SUMMARY:${summary}
DTSTART:20260512T100000Z
END:VEVENT
END:VCALENDAR`

    expect(parseIcs(ics('Tren AVE Madrid - Sevilla'))[0].category).toBe('train')
    expect(parseIcs(ics('Alquiler de coche Europcar'))[0].category).toBe('car_rental')
    expect(parseIcs(ics('Visita guiada al Coliseo'))[0].category).toBe('tour')
    expect(parseIcs(ics('Entrada Museo del Prado'))[0].category).toBe('ticket')
    expect(parseIcs(ics('Cumpleaños de Marta'))[0].category).toBe('other')
  })

  it('ordena por fecha y admite varios eventos en un fichero', () => {
    const bookings = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:b
SUMMARY:Vuelo de vuelta
DTSTART:20260520T080000Z
END:VEVENT
BEGIN:VEVENT
UID:a
SUMMARY:Vuelo de ida
DTSTART:20260512T100000Z
END:VEVENT
END:VCALENDAR`)

    expect(bookings.map(b => b.title)).toEqual(['Vuelo de ida', 'Vuelo de vuelta'])
  })

  it('no lanza con un fichero que no es un calendario', () => {
    expect(parseIcs('esto no es un ics')).toEqual([])
    expect(parseIcs('')).toEqual([])
  })
})

describe('activityTypeFor', () => {
  it('mapea la reserva al tipo de actividad del itinerario', () => {
    expect(activityTypeFor('flight')).toBe('flight')
    expect(activityTypeFor('hotel')).toBe('hotel')
    expect(activityTypeFor('train')).toBe('transport')
    expect(activityTypeFor('bus')).toBe('transport')
    expect(activityTypeFor('tour')).toBe('activity')
  })
})
