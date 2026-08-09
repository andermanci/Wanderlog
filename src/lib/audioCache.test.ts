import { describe, it, expect, vi, afterEach } from 'vitest'
import { audioSize, formatBytes } from './audioCache'

const URL_MP3 = 'https://xyz.supabase.co/storage/v1/object/public/audioguides/u/t/a/s.mp3'

afterEach(() => { vi.unstubAllGlobals() })

describe('audioSize', () => {
  it('usa el Content-Length real cuando el servidor responde al HEAD', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 200,
      headers: { 'content-length': '1048576' },
    })))
    expect(await audioSize(URL_MP3, 120)).toEqual({ bytes: 1048576, exact: true })
  })

  // Sin conexión (o con CORS de por medio) el aviso de tamaño tiene que seguir
  // saliendo: se estima por duración y se marca como aproximado.
  it('estima por duración si el HEAD falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))
    expect(await audioSize(URL_MP3, 120)).toEqual({ bytes: 480000, exact: false })
  })

  it('estima por duración si el servidor no manda Content-Length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    const { exact } = await audioSize(URL_MP3, 60)
    expect(exact).toBe(false)
  })

  it('sin duración conocida no inventa tamaño', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))
    expect(await audioSize(URL_MP3, null)).toEqual({ bytes: 0, exact: false })
  })
})

describe('formatBytes', () => {
  it('formatea en la unidad que toca', () => {
    expect(formatBytes(900)).toBe('1 KB')
    expect(formatBytes(1024 * 500)).toBe('500 KB')
    expect(formatBytes(1024 * 1024 * 12)).toBe('12 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
  })
})
