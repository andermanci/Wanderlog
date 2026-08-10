import { describe, it, expect } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('NULL Y CERO NO ROMPEN — storage_bytes viene null cuando el usuario no tiene ficheros', () => {
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
    expect(formatBytes(0)).toBe('0 B')
  })

  it('usa base 1000, como el panel de Supabase con el que se compara', () => {
    expect(formatBytes(1000)).toBe('1 kB')
    expect(formatBytes(1_500_000)).toBe('1.5 MB')
    expect(formatBytes(813_864_600)).toBe('814 MB')
    expect(formatBytes(1_200_000_000)).toBe('1.2 GB')
  })

  it('no pone decimales por debajo de MB: ahí son ruido', () => {
    expect(formatBytes(1500)).toBe('2 kB')
  })

  it('no se sale de la escala con valores absurdos', () => {
    expect(formatBytes(1e18)).toContain('TB')
  })
})
