import { describe, it, expect, vi } from 'vitest'
import { recortarProps } from './usage'

describe('recortarProps', () => {
  it('deja pasar escalares y recorta los textos largos', () => {
    expect(recortarProps({ a: 'x', n: 3, b: true, z: null }))
      .toEqual({ a: 'x', n: 3, b: true, z: null })
    expect((recortarProps({ t: 'y'.repeat(200) }).t as string).length).toBe(64)
  })

  it('TIRA OBJETOS Y ARRAYS — es lo que impide que un documento entero acabe en la tabla', () => {
    expect(recortarProps({ doc: { titulo: 'Pasaporte', numero: 'AB1234' } })).toEqual({})
    expect(recortarProps({ lista: [1, 2, 3] })).toEqual({})
  })

  it('descarta números que no son números', () => {
    expect(recortarProps({ n: NaN, i: Infinity })).toEqual({})
  })

  it('tope de claves: unas props con cincuenta campos son un error, no un evento', () => {
    const muchas = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(recortarProps(muchas))).toHaveLength(10)
  })
})

describe('emitirUso', () => {
  it('NO LANZA aunque supabase reviente, y no devuelve promesa que se pueda await', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({
      supabase: {
        auth: { getSession: () => { throw new Error('boom') } },
        from: () => { throw new Error('boom') },
      },
    }))
    const { emitirUso } = await import('./usage')

    // Si devolviera una promesa, alguien la awaitaría en un onSuccess y le
    // metería la latencia de red al usuario. Tiene que ser void.
    expect(emitirUso('pwa.installed')).toBeUndefined()

    // Y el rechazo interno no puede escaparse como unhandled rejection.
    await new Promise(r => setTimeout(r, 10))
    vi.doUnmock('@/lib/supabase')
  })
})
