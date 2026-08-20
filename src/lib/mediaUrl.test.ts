import { describe, it, expect, vi, afterEach } from 'vitest'
import { mediaUrl, mediaUrlOrThrow } from './mediaUrl'

const R2 = 'https://pub-abc.r2.dev'

afterEach(() => { vi.unstubAllEnvs() })

describe('mediaUrl', () => {
  it('resuelve una clave contra el origen público', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', R2)
    expect(mediaUrl('u/t/a/s.mp3')).toBe(`${R2}/u/t/a/s.mp3`)
  })

  // La convivencia durante la migración: mientras se reescriben las filas, unas
  // traen la clave nueva y otras la URL vieja de Supabase, y las dos suenan.
  it('deja pasar sin tocar lo que ya es una URL', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', R2)
    const supabase = 'https://xyz.supabase.co/storage/v1/object/public/audioguides/u/t/a/s.mp3'
    expect(mediaUrl(supabase)).toBe(supabase)
    expect(mediaUrl('http://localhost:54321/x.mp3')).toBe('http://localhost:54321/x.mp3')
    // Las imágenes de las paradas siguen siendo absolutas (ver 057).
    expect(mediaUrl('https://upload.wikimedia.org/a.jpg')).toBe('https://upload.wikimedia.org/a.jpg')
    expect(mediaUrl('blob:http://localhost/9f3')).toBe('blob:http://localhost/9f3')
    expect(mediaUrl('data:audio/mpeg;base64,AAA')).toBe('data:audio/mpeg;base64,AAA')
  })

  it('no genera barras dobles', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', `${R2}/`)
    expect(mediaUrl('/u/t/a/s.mp3')).toBe(`${R2}/u/t/a/s.mp3`)
    expect(mediaUrl('u/t/a/s.mp3')).toBe(`${R2}/u/t/a/s.mp3`)
  })

  it('sin valor no hay URL', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', R2)
    expect(mediaUrl(null)).toBeNull()
    expect(mediaUrl(undefined)).toBeNull()
    expect(mediaUrl('')).toBeNull()
  })

  /**
   * El fallo que esto previene: devolver la clave a secas la resolvería el
   * navegador contra el dominio de la app, donde el fallback SPA responde
   * index.html con un 200. Un «MP3» que es HTML falla de una forma que no se
   * parece en nada a «falta una variable de entorno».
   */
  it('sin origen configurado devuelve null, nunca una ruta relativa', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mediaUrl('u/t/a/s.mp3')).toBeNull()
  })

  it('mediaUrlOrThrow avisa en vez de devolver algo inservible', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => mediaUrlOrThrow('u/t/a/s.mp3')).toThrow(/VITE_R2_PUBLIC_URL/)
  })
})
