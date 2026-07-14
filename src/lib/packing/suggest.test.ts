import { describe, it, expect } from 'vitest'
import { suggestPacking, dedupeAgainst } from './suggest'

const names = (items: { name: string }[]) => items.map(i => i.name)
const find = (items: { name: string; reason?: string }[], needle: string) =>
  items.find(i => i.name.toLowerCase().includes(needle.toLowerCase()))

describe('suggestPacking', () => {
  it('ajusta las cantidades a la duración del viaje', () => {
    const corto = suggestPacking({ nights: 2 })
    const largo = suggestPacking({ nights: 6 })

    expect(find(corto, 'camisetas')?.name).toBe('Camisetas ×3')
    expect(find(largo, 'camisetas')?.name).toBe('Camisetas ×7')
  })

  it('no manda 20 camisetas para un viaje de 20 días: se asume lavadora', () => {
    const items = suggestPacking({ nights: 19 })
    expect(find(items, 'camisetas')?.name).toBe('Camisetas ×7')
    expect(find(items, 'camisetas')?.reason).toContain('lavadora')
  })

  it('mete abrigo si va a hacer frío, y dice por qué', () => {
    const items = suggestPacking({ nights: 3, tmin: 4 })
    const abrigo = find(items, 'abrigo')
    expect(abrigo).toBeDefined()
    expect(abrigo!.reason).toBe('van a caer 4° de mínima')
    expect(names(items)).toContain('Jersey o sudadera')
  })

  it('sube a abrigo de invierno bajo cero', () => {
    const items = suggestPacking({ nights: 3, tmin: -5 })
    expect(names(items)).toContain('Abrigo de invierno')
    expect(names(items)).toContain('Guantes y gorro')
  })

  it('mete crema solar y ropa ligera si va a hacer calor', () => {
    const items = suggestPacking({ nights: 3, tmax: 31 })
    expect(find(items, 'crema solar')?.reason).toBe('se esperan 31° de máxima')
    expect(names(items)).toContain('Ropa ligera')
  })

  it('mete chubasquero solo si llueve lo suficiente', () => {
    expect(names(suggestPacking({ nights: 5, rainyRatio: 0.1 }))).not.toContain('Chubasquero o paraguas')

    const lluvioso = suggestPacking({ nights: 5, rainyRatio: 0.4 })
    expect(find(lluvioso, 'chubasquero')?.reason).toBe('llueve alrededor del 40 % de los días')
  })

  it('detecta el plan a partir del itinerario', () => {
    const playa = suggestPacking({
      nights: 5,
      activities: [{ title: 'Día en la playa de Ipanema', type: 'activity' }],
    })
    expect(names(playa)).toContain('Bañador')
    expect(find(playa, 'bañador')?.reason).toBe('hay playa en el itinerario')

    const monte = suggestPacking({
      nights: 5,
      activities: [{ title: 'Ruta de senderismo al volcán', type: 'activity' }],
    })
    expect(names(monte)).toContain('Botas de trekking')
    expect(names(monte)).not.toContain('Bañador')
  })

  it('usa el enchufe del destino que la guía saca de Wikidata', () => {
    const items = suggestPacking({ nights: 3, plug: 'B' })
    const adaptador = find(items, 'adaptador')
    expect(adaptador!.name).toBe('Adaptador de enchufe (tipo B)')
    expect(adaptador!.reason).toBe('en el destino usan el enchufe tipo B')
  })

  it('sin datos de clima, no inventa ropa de abrigo ni de calor', () => {
    const items = names(suggestPacking({ nights: 3 }))
    expect(items).not.toContain('Abrigo')
    expect(items).not.toContain('Ropa ligera')
    expect(items).toContain('Pasaporte o DNI')  // lo básico sí
  })
})

describe('dedupeAgainst', () => {
  it('no vuelve a proponer lo que ya está en la lista', () => {
    // Es el bug de las plantillas de antes: aplicarlas dos veces duplicaba todo.
    const suggestions = suggestPacking({ nights: 3, tmin: 5 })
    const existing = [{ name: 'Abrigo' }, { name: 'Pasaporte o DNI' }]

    const result = names(dedupeAgainst(suggestions, existing))
    expect(result).not.toContain('Abrigo')
    expect(result).not.toContain('Pasaporte o DNI')
    expect(result).toContain('Jersey o sudadera')
  })

  it('compara sin tildes, sin mayúsculas y sin la cantidad', () => {
    const suggestions = suggestPacking({ nights: 3 })
    const existing = [{ name: 'camisetas' }, { name: 'MEDICACIÓN habitual' }]

    const result = names(dedupeAgainst(suggestions, existing))
    expect(result.some(n => n.startsWith('Camisetas'))).toBe(false)
    expect(result).not.toContain('Medicación habitual')
  })
})
