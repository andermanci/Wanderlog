import { describe, it, expect } from 'vitest'
import { activeSentenceIndex, estimateTimings, splitSentences } from './sentences'

describe('splitSentences', () => {
  it('divide un guion en frases por . ! ? …', () => {
    expect(splitSentences(
      'Bienvenidos a la catedral de Santiago. Este templo es la meta del Camino. ¿Sabíais que tardó más de un siglo en construirse?',
    )).toEqual([
      'Bienvenidos a la catedral de Santiago.',
      'Este templo es la meta del Camino.',
      '¿Sabíais que tardó más de un siglo en construirse?',
    ])
  })

  it('no corta en abreviaturas como Sr. o s. XVI', () => {
    expect(splitSentences(
      'Aquí vivió el Sr. García durante décadas. La torre data del s. XVI y sigue en pie.',
    )).toEqual([
      'Aquí vivió el Sr. García durante décadas.',
      'La torre data del s. XVI y sigue en pie.',
    ])
  })

  it('no corta en números con punto de millar', () => {
    expect(splitSentences(
      'El pueblo tiene 3.500 habitantes según el censo. Muchos viven del turismo actualmente.',
    )).toEqual([
      'El pueblo tiene 3.500 habitantes según el censo.',
      'Muchos viven del turismo actualmente.',
    ])
  })

  it('fusiona fragmentos cortos con la frase anterior', () => {
    expect(splitSentences(
      '¡Atención! Estamos ante una de las fachadas más fotografiadas de la ciudad. ¡Sí! Fue restaurada hace apenas una década.',
    )).toEqual([
      '¡Atención! Estamos ante una de las fachadas más fotografiadas de la ciudad. ¡Sí!',
      'Fue restaurada hace apenas una década.',
    ])
  })

  it('devuelve una sola frase si no hay puntuación', () => {
    expect(splitSentences('un guion sin puntuación ninguna que sigue y sigue'))
      .toEqual(['un guion sin puntuación ninguna que sigue y sigue'])
  })

  it('normaliza saltos de línea y espacios múltiples', () => {
    expect(splitSentences('Primera frase del guion completo.\n\nSegunda   frase con espacios de más.'))
      .toEqual(['Primera frase del guion completo.', 'Segunda frase con espacios de más.'])
  })

  it('devuelve vacío para texto vacío', () => {
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('estimateTimings', () => {
  const text = 'Primera frase del guion de la parada. Segunda frase bastante más larga que la anterior para el reparto. ¿Tercera y última frase del guion?'

  it('reparte la duración proporcionalmente, empezando en 0 y creciendo', () => {
    const timings = estimateTimings(text, 60)
    expect(timings).toHaveLength(3)
    expect(timings[0].start).toBe(0)
    expect(timings[1].start).toBeGreaterThan(0)
    expect(timings[2].start).toBeGreaterThan(timings[1].start)
    expect(timings[2].start).toBeLessThan(60)
    // La segunda frase es más larga: su tramo (start2 → start3) debe ser mayor
    expect(timings[2].start - timings[1].start).toBeGreaterThan(timings[1].start)
  })

  it('con duración inválida devuelve las frases con start 0', () => {
    const timings = estimateTimings(text, 0)
    expect(timings).toHaveLength(3)
    expect(timings.every((t) => t.start === 0)).toBe(true)
  })
})

describe('activeSentenceIndex', () => {
  const timings = [
    { text: 'a', start: 0 },
    { text: 'b', start: 10 },
    { text: 'c', start: 20 },
  ]

  it('devuelve la última frase cuyo inicio ya ha pasado', () => {
    expect(activeSentenceIndex(timings, 0)).toBe(0)
    expect(activeSentenceIndex(timings, 9)).toBe(0)
    expect(activeSentenceIndex(timings, 10)).toBe(1)
    expect(activeSentenceIndex(timings, 25)).toBe(2)
  })

  it('se adelanta ligeramente al inicio de la siguiente frase', () => {
    expect(activeSentenceIndex(timings, 9.9)).toBe(1)
  })

  it('devuelve -1 antes de la primera frase o sin timings', () => {
    expect(activeSentenceIndex([{ text: 'a', start: 2 }], 0)).toBe(-1)
    expect(activeSentenceIndex([], 5)).toBe(-1)
  })
})
