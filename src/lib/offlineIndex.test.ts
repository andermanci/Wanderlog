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
    writeOfflineIndex('t1', { photos: ['p1'], audios: ['a1', 'a2'], docs: [], bytes: 1234 })
    expect(readOfflineIndex('t1')).toEqual({ photos: ['p1'], audios: ['a1', 'a2'], docs: [], bytes: 1234 })
  })

  // Quien ya tenía un viaje descargado guardaba solo la marca '1': hay que
  // seguir viéndolo como descargado (aunque no sepamos qué ficheros trajo).
  it('entiende la marca antigua', () => {
    localStorage.setItem('wanderlog-offline-t1', '1')
    expect(readOfflineIndex('t1')).toEqual({ photos: [], audios: [], docs: [], bytes: 0 })
  })

  it('no revienta con un valor corrupto', () => {
    localStorage.setItem('wanderlog-offline-t1', '{roto')
    expect(readOfflineIndex('t1')).toBeNull()
  })
})
