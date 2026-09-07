import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { createIdbPersister, clearPersistedQueries } from './queryPersister'

// jsdom NO implementa IndexedDB, así que estos tests recorren exactamente el
// plan B: el navegador sin IndexedDB (modo privado de algún Safari viejo). Es
// el camino donde un fallo cuesta caro —ahí vive la copia del viaje— y el que
// no se puede comprobar desde el navegador de verdad, donde IndexedDB siempre
// está. El camino normal se verifica en el navegador.

const cliente = (marca: string): PersistedClient => ({
  timestamp: 1,
  buster: '1',
  clientState: { mutations: [], queries: [{ queryHash: marca }] },
} as unknown as PersistedClient)

const leerLs = () => {
  const raw = localStorage.getItem('wanderlog-cache')
  return raw ? (JSON.parse(raw) as PersistedClient) : null
}

const marcaDe = (c: PersistedClient | null | undefined) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (c?.clientState as any)?.queries?.[0]?.queryHash ?? null

beforeEach(() => { localStorage.clear() })

describe('createIdbPersister sin IndexedDB', () => {
  it('no devuelve nada si no hay caché guardada', async () => {
    expect(await createIdbPersister().restoreClient()).toBeUndefined()
  })

  it('guarda en localStorage cuando IndexedDB no está disponible', async () => {
    const p = createIdbPersister()
    await p.persistClient(cliente('a'))
    expect(marcaDe(leerLs())).toBe('a')
    expect(marcaDe(await p.restoreClient())).toBe('a')
  })

  // Esto es lo que de verdad se quiere blindar: la migración lee la caché de
  // localStorage para pasarla a IndexedDB, y si IndexedDB no existe la copia
  // falla. Borrarla de todos modos dejaría a esa persona sin su viaje
  // descargado justo al actualizar la app.
  it('NO borra la copia de localStorage si no ha podido pasarla a IndexedDB', async () => {
    localStorage.setItem('wanderlog-cache', JSON.stringify(cliente('viaje')))

    const restaurado = await createIdbPersister().restoreClient()

    expect(marcaDe(restaurado)).toBe('viaje')
    expect(marcaDe(leerLs())).toBe('viaje')
  })

  it('sobrevive a una caché corrupta en vez de reventar el arranque', async () => {
    localStorage.setItem('wanderlog-cache', '{roto')
    expect(await createIdbPersister().restoreClient()).toBeUndefined()
  })

  // persistClient se llama en CADA evento de la caché de queries: lo que tiene
  // que quedar es el último estado, no una escritura por evento.
  it('agrupa las escrituras solapadas y deja la última', async () => {
    const p = createIdbPersister()
    await Promise.all([
      p.persistClient(cliente('1')),
      p.persistClient(cliente('2')),
      p.persistClient(cliente('3')),
    ])
    expect(marcaDe(leerLs())).toBe('3')
  })

  it('si IndexedDB existe pero no se puede leer, NO escribe nada encima', async () => {
    // El caso peligroso de WebKit: la apertura falla (o se cuelga y salta el
    // plazo), la app arranca con la caché vacía y, sin freno, la primera
    // escritura machacaría el viaje descargado que sigue en disco.
    localStorage.setItem('wanderlog-cache', JSON.stringify(cliente('viaje')))
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req: Record<string, unknown> = {}
        setTimeout(() => (req.onerror as () => void)?.(), 0)
        return req
      },
    })

    const p = createIdbPersister()
    expect(await p.restoreClient()).toBeUndefined()

    await p.persistClient(cliente('vacio'))

    // La copia de disco sigue como estaba: se pierde una sesión sin persistir,
    // no el viaje.
    expect(marcaDe(leerLs())).toBe('viaje')
    vi.unstubAllGlobals()
  })

  it('removeClient y clearPersistedQueries dejan el almacenamiento limpio', async () => {
    const p = createIdbPersister()
    await p.persistClient(cliente('a'))

    await p.removeClient()
    expect(leerLs()).toBeNull()

    await p.persistClient(cliente('b'))
    await clearPersistedQueries()
    expect(leerLs()).toBeNull()
  })
})
