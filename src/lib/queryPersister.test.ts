import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { createIdbPersister, clearPersistedQueries, debePersistirse, sanear } from './queryPersister'

// jsdom NO implementa IndexedDB, así que estos tests recorren exactamente el
// plan B: el navegador sin IndexedDB (modo privado de algún Safari viejo). Es
// el camino donde un fallo cuesta caro —ahí vive la copia del viaje— y el que
// no se puede comprobar desde el navegador de verdad, donde IndexedDB siempre
// está. El camino normal se verifica en el navegador.

const cliente = (marca: string): PersistedClient => ({
  timestamp: 1,
  buster: '1',
  clientState: { mutations: [], queries: [{ queryHash: marca, state: { data: marca, status: 'success' } }] },
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

  // El agrupador de escrituras soltaba `escribiendo` dentro del bucle, que en
  // los modos sin IndexedDB termina en el mismo tick: quedaba apuntando a una
  // promesa resuelta y todas las escrituras de la sesión tras la primera se
  // perdían. Aquí se esperan una a una, que es como llegan en la app.
  it('en modo solo localStorage no se pierde ninguna escritura tras la primera', async () => {
    const p = createIdbPersister()
    await p.restoreClient()
    await p.persistClient(cliente('1'))
    await p.persistClient(cliente('2'))
    await p.persistClient(cliente('3'))
    expect(marcaDe(leerLs())).toBe('3')
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

// El fallo de «descargo el viaje y al volver me pone Viaje no encontrado»,
// reproducido con un QueryClient de verdad: un refetch que falla deja la query
// con sus datos en memoria pero con status 'error', y el filtro por defecto de
// React Query la sacaba de la siguiente escritura a disco.
describe('qué va a disco cuando un refetch falla', () => {
  const KEY = ['trips', 'detail', 't1']
  const VIAJE = { id: 't1', name: 'VERANO 2026' }

  async function queryConRefetchFallido() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let falla = false
    const queryFn = async () => {
      if (falla) throw new TypeError('Load failed')
      return VIAJE
    }
    await qc.fetchQuery({ queryKey: KEY, queryFn })
    falla = true
    await qc.fetchQuery({ queryKey: KEY, queryFn, staleTime: 0 }).catch(() => {})
    return qc
  }

  it('el refetch fallido deja los datos en memoria con status error', async () => {
    const qc = await queryConRefetchFallido()
    expect(qc.getQueryData(KEY)).toEqual(VIAJE)
    expect(qc.getQueryState(KEY)?.status).toBe('error')
  })

  it('con el filtro por defecto, el viaje desaparecía del disco', async () => {
    const qc = await queryConRefetchFallido()
    expect(dehydrate(qc).queries).toHaveLength(0)
  })

  it('con debePersistirse + sanear, se guarda y se restaura como dato bueno', async () => {
    const qc = await queryConRefetchFallido()
    const guardado = sanear({
      timestamp: Date.now(),
      buster: '1',
      clientState: dehydrate(qc, { shouldDehydrateQuery: debePersistirse }),
    })

    // Lo que va a IndexedDB tiene que poder clonarse: sin el Error colgando.
    expect(() => structuredClone(guardado)).not.toThrow()
    expect(guardado.clientState.queries[0].state.error).toBeNull()

    const arranque = new QueryClient()
    hydrate(arranque, guardado.clientState)
    expect(arranque.getQueryData(KEY)).toEqual(VIAJE)
    expect(arranque.getQueryState(KEY)?.status).toBe('success')
  })

  it('no guarda lo que nunca tuvo datos ni lo del panel de administración', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await qc.fetchQuery({ queryKey: ['admin', 'usuarios'], queryFn: async () => [1, 2] })
    await qc.fetchQuery({ queryKey: ['trips', 'detail', 'nunca'], queryFn: async () => { throw new Error('x') } })
      .catch(() => {})
    expect(dehydrate(qc, { shouldDehydrateQuery: debePersistirse }).queries).toHaveLength(0)
  })
})
