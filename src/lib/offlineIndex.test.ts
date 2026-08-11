import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readOfflineIndex, writeOfflineIndex } from './offlineIndex'

// offlineIndex arrastra las query keys y las cachés, que a su vez importan el
// cliente de Supabase: aquí solo se prueba el índice, así que basta con que exista.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

beforeEach(() => { localStorage.clear() })

describe('readOfflineIndex', () => {
  it('devuelve null si el viaje no está descargado', () => {
    expect(readOfflineIndex('t1')).toBeNull()
  })

  it('lee lo que se guardó', () => {
    writeOfflineIndex('t1', { photos: ['p1'], audios: 2, docs: [], bytes: 1234 })
    expect(readOfflineIndex('t1')).toEqual({ photos: ['p1'], audios: 2, docs: [], bytes: 1234 })
  })

  // Quien ya tenía un viaje descargado guardaba solo la marca '1': hay que
  // seguir viéndolo como descargado (aunque no sepamos qué ficheros trajo).
  it('entiende la marca antigua', () => {
    localStorage.setItem('wanderlog-offline-t1', '1')
    expect(readOfflineIndex('t1')).toEqual({ photos: [], audios: 0, docs: [], bytes: 0 })
  })

  // Índices escritos cuando se guardaba la lista entera de URLs de audio.
  it('entiende los índices con la lista de audios', () => {
    localStorage.setItem('wanderlog-offline-t1', JSON.stringify({ photos: [], audios: ['a1', 'a2'], docs: [], bytes: 9 }))
    expect(readOfflineIndex('t1')).toEqual({ photos: [], audios: 2, docs: [], bytes: 9 })
  })

  it('no revienta con un valor corrupto', () => {
    localStorage.setItem('wanderlog-offline-t1', '{roto')
    expect(readOfflineIndex('t1')).toBeNull()
  })

  // El fallo que reportó el usuario: la descarga terminaba bien y al anotarla
  // saltaba la cuota de localStorage, y todo se daba por fallido.
  it('deja la marca mínima si el índice no cabe', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementationOnce(() => { throw new DOMException('lleno', 'QuotaExceededError') })
    expect(() => writeOfflineIndex('t1', { photos: ['p1'], audios: 487, docs: [], bytes: 5 })).not.toThrow()
    setItem.mockRestore()
    expect(readOfflineIndex('t1')).toEqual({ photos: [], audios: 0, docs: [], bytes: 0 })
  })
})
