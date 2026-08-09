import { describe, it, expect, vi, afterEach } from 'vitest'
import { audioSize, formatBytes, refreshAudioIfChanged } from './audioCache'

const URL_MP3 = 'https://xyz.supabase.co/storage/v1/object/public/audioguides/u/t/a/s.mp3'

afterEach(() => { vi.unstubAllGlobals() })

// Cache API de mentira: un Map, que es lo único que usamos de ella.
function fakeCaches(entries: Record<string, Response> = {}) {
  const store = new Map(Object.entries(entries))
  const cache = {
    match: async (k: string) => store.get(k),
    put: async (k: string, v: Response) => { store.set(k, v) },
    delete: async (k: string) => store.delete(k),
  }
  vi.stubGlobal('caches', { open: async () => cache, delete: async () => true })
  return store
}

const KEY = '/__audio__/u/t/a/s.mp3'
const mp3 = (lastModified: string, length: string) => new Response('audio', {
  headers: { 'last-modified': lastModified, 'content-length': length },
})

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

describe('refreshAudioIfChanged', () => {
  const HEAD_ONLY = (init: ResponseInit) => vi.fn(async (_url: string, opts?: RequestInit) => {
    if (opts?.method !== 'HEAD') throw new Error('no debería descargar el MP3')
    return new Response(null, init)
  })

  it('si el audio no ha cambiado, no se descarga nada', async () => {
    fakeCaches({ [KEY]: mp3('Mon, 01 Jun 2026 10:00:00 GMT', '48000') })
    const fetchMock = HEAD_ONLY({ headers: { 'last-modified': 'Mon, 01 Jun 2026 10:00:00 GMT', 'content-length': '48000' } })
    vi.stubGlobal('fetch', fetchMock)

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('si se ha regenerado, se baja la versión nueva', async () => {
    const store = fakeCaches({ [KEY]: mp3('Mon, 01 Jun 2026 10:00:00 GMT', '48000') })
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts?: RequestInit) => {
      const headers = { 'last-modified': 'Tue, 02 Jun 2026 09:00:00 GMT', 'content-length': '52000' }
      return opts?.method === 'HEAD' ? new Response(null, { headers }) : new Response('nuevo', { headers })
    }))

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(true)
    expect(await store.get(KEY)?.text()).toBe('nuevo')
  })

  // Descargas viejas, guardadas antes de que se guardaran las cabeceras: sin
  // nada con que comparar, bajarlas otra vez sería gastar datos a ciegas.
  it('no toca las copias sin cabeceras que comparar', async () => {
    fakeCaches({ [KEY]: new Response('audio') })
    const fetchMock = vi.fn(async () => new Response(null))
    vi.stubGlobal('fetch', fetchMock)

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no comprueba nada si la parada no está descargada', async () => {
    fakeCaches()
    const fetchMock = vi.fn(async () => new Response(null))
    vi.stubGlobal('fetch', fetchMock)

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin conexión ni se intenta', async () => {
    fakeCaches({ [KEY]: mp3('Mon, 01 Jun 2026 10:00:00 GMT', '48000') })
    const fetchMock = vi.fn(async () => new Response(null))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si el servidor no contesta al HEAD, se queda lo descargado', async () => {
    fakeCaches({ [KEY]: mp3('Mon, 01 Jun 2026 10:00:00 GMT', '48000') })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))

    expect(await refreshAudioIfChanged(URL_MP3)).toBe(false)
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
