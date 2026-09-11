import type { Query } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

// Dónde se guarda la caché de queries para poder usar los viajes sin conexión.
//
// POR QUÉ INDEXEDDB Y NO localStorage: toda la caché se persiste en UNA sola
// clave, y localStorage da ~5 MB por origen. Los datos de un viaje con
// audioguías rondan 1 MB —las paradas pesan, sobre todo `sentence_timings`, que
// repite el guion frase a frase para el resaltado—, así que con tres viajes
// descargados ya no cabe. Y cuando no cabe, el fallo es silencioso y muy malo:
// `removeOldestQuery` va soltando la query más antigua hasta que entra, y la
// más antigua suele ser la LISTA DE VIAJES, que se precarga al arrancar y no se
// vuelve a tocar. El resultado es la app diciendo «viaje disponible sin
// conexión» y luego, en modo avión, un dashboard vacío. Está reproducido.
//
// IndexedDB comparte el presupuesto de almacenamiento del navegador con la
// Cache API (donde ya viven los MP3, los documentos y las fotos): del orden de
// gigabytes en vez de cinco megas. Y guarda el objeto tal cual, por clonado
// estructurado, así que además nos ahorramos serializar un megabyte a JSON en
// cada escritura.
//
// Se escribe a mano en vez de traer @tanstack/query-async-storage-persister +
// idb-keyval porque son cuatro docenas de líneas y una dependencia menos, igual
// que docCache.ts o el cliente de R2.
const DB_NAME = 'wanderlog-query-cache'
const STORE = 'cache'
const RECORD = 'client'

// La clave donde vivía la caché antes de esta mudanza. Sigue siendo el plan B
// para un navegador sin IndexedDB, y de ahí se rescata la copia de quien
// actualice la app en mitad de un viaje.
const CLAVE_LS = 'wanderlog-cache'

/** ¿Existe IndexedDB en este navegador? Distinto de que funcione. */
function hayIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hayIndexedDB()) return resolve(null)
    let req: IDBOpenDBRequest
    try { req = indexedDB.open(DB_NAME, 1) } catch { return resolve(null) }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
    // Safari en modo privado puede dejar la petición colgada sin resolver ni
    // fallar. Sin este plazo, restoreClient() no volvería nunca y la app se
    // quedaría en el spinner de arranque, que es peor que no tener caché.
    setTimeout(() => resolve(null), 3000)
  })
}

/** Ejecuta una operación sobre el almacén. `null` = IndexedDB no ha podido. */
function operar<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return abrir().then((db) => {
    if (!db) return null
    return new Promise<T | null>((resolve) => {
      let req: IDBRequest<T>
      try { req = fn(db.transaction(STORE, modo).objectStore(STORE)) } catch { return resolve(null) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    }).finally(() => db.close())
  })
}

// --- Plan B: localStorage ---------------------------------------------------
// Solo se usa si IndexedDB no existe (modo privado de algún Safari viejo). Es
// exactamente lo que hacía la app antes, con sus 5 MB: peor que IndexedDB, pero
// muchísimo mejor que quedarse sin nada en un avión.

function leerLs(): PersistedClient | undefined {
  try {
    const raw = localStorage.getItem(CLAVE_LS)
    return raw ? (JSON.parse(raw) as PersistedClient) : undefined
  } catch {
    return undefined
  }
}

function escribirLs(cliente: PersistedClient): boolean {
  try {
    localStorage.setItem(CLAVE_LS, JSON.stringify(cliente))
    return true
  } catch {
    return false
  }
}

function borrarLs(): void {
  try { localStorage.removeItem(CLAVE_LS) } catch { /* nada que hacer */ }
}

/**
 * Qué queries se escriben en disco: TODA la que tenga datos, aunque su último
 * refetch haya fallado. Menos las del panel de administración, que son datos
 * de otras personas y no tienen por qué sobrevivir a la pestaña.
 *
 * Aquí estaba antes `defaultShouldDehydrateQuery`, que solo deja pasar
 * status === 'success'. Y React Query pone status 'error' cuando un refetch en
 * segundo plano falla AUNQUE conserve los datos. Así que bastaba un refresco
 * fallido para que la siguiente escritura borrase del disco un viaje
 * perfectamente descargado. Y pasaba justo en el peor momento: bajando cientos
 * de megas de audios con el 4G saturado, o al desbloquear el móvil con la app
 * abierta, cuando todo lo montado en pantalla está caducado y se refresca.
 *
 * Reproducido el 11/09/2026: tras un refetch fallido desaparecían del disco el
 * detalle del viaje, los días, las actividades, los documentos y los gastos,
 * pero NO la lista de viajes, que no estaba montada y no se refrescó.
 * Resultado en modo avión: el viaje sale en la lista y al entrar, tras ~16 s de
 * reintentos (3 de postgrest-js × 2 de React Query), «Viaje no encontrado».
 */
export function debePersistirse(q: Query): boolean {
  return q.state.data !== undefined && q.queryKey[0] !== 'admin'
}

/**
 * Lo que va a disco es el último DATO BUENO de cada query, no su último intento.
 *
 * `debePersistirse` deja pasar las queries con datos aunque su último refetch
 * haya fallado. Esas llegan aquí con status 'error' y el error del intento
 * colgando, y eso no puede ir tal cual:
 *
 * - Restaurada como 'error' (hydrate conserva el status tal cual), la query le
 *   diría a la pantalla que falló, cuando lo que tiene es un dato bueno de
 *   hace un rato, que es justo lo que se quiere ver sin conexión.
 * - El error es un objeto Error (o un PostgrestError). IndexedDB guarda por
 *   clonado estructurado, y un Error con propiedades propias no siempre se
 *   clona igual en todos los navegadores; un DataCloneError tumbaría la
 *   escritura ENTERA, no solo esa query.
 *
 * Así que se guarda como un éxito con su `dataUpdatedAt` de verdad: al volver
 * la red está caducada por tiempo y se refresca sola. Por lo mismo se quita
 * `promise` (una query pendiente no se puede clonar) y se deja `fetchStatus`
 * en reposo: lo que se estaba pidiendo en el momento de escribir no sigue
 * pidiéndose en el próximo arranque.
 */
export function sanear(cliente: PersistedClient): PersistedClient {
  const { queries, mutations } = cliente.clientState
  return {
    ...cliente,
    clientState: {
      ...cliente.clientState,
      queries: queries.map((q) => q.state ? {
        ...q,
        promise: undefined,
        state: {
          ...q.state,
          status: q.state.data !== undefined ? 'success' : q.state.status,
          fetchStatus: 'idle',
          error: null,
          fetchFailureReason: null,
          fetchFailureCount: 0,
        },
      } : q),
      mutations: mutations.map((m) => m.state ? {
        ...m,
        state: { ...m.state, error: null, failureReason: null },
      } : m),
    },
  }
}

/**
 * Persister de React Query sobre IndexedDB, con localStorage de reserva.
 *
 * `persistClient` se llama en CADA evento de la caché de queries (el core no
 * aplica ningún throttle), así que las escrituras se solapan: si ya hay una en
 * vuelo, la nueva se queda apuntada como «lo siguiente que hay que escribir» y
 * las intermedias se descartan. Solo importa el último estado.
 */
export function createIdbPersister(): Persister {
  let escribiendo: Promise<void> | null = null
  let pendiente: PersistedClient | null = null

  // Qué se ha averiguado al restaurar. Importa sobre todo 'lectura-fallida':
  //
  //   SI NO HEMOS PODIDO LEER, NO ESCRIBIMOS.
  //
  // Si IndexedDB existe pero la lectura falla (en WebKit se han visto aperturas
  // que se cuelgan tras matar la app, y de ahí el plazo de `abrir`), la app
  // arranca con la caché vacía. Sin este freno, el primer evento de queries
  // guardaría ese estado vacío ENCIMA del viaje descargado y lo destruiría: un
  // fallo transitorio se convertiría en pérdida permanente. Prefiero una
  // sesión sin persistir —la copia de disco sigue intacta para el siguiente
  // arranque— a machacarla.
  let modo: 'normal' | 'solo-localstorage' | 'lectura-fallida' = 'normal'

  async function vaciarPendiente(): Promise<void> {
    while (pendiente) {
      const siguiente = pendiente
      pendiente = null
      // Una escritura que revienta no puede llevarse por delante a las demás:
      // si esto lanzase, `lanzar` quedaría rechazada, `escribiendo` no se
      // soltaría nunca y el resto de la sesión no guardaría nada.
      try {
        if (modo === 'lectura-fallida') continue
        const cliente = sanear(siguiente)
        if (modo === 'solo-localstorage') { escribirLs(cliente); continue }
        const guardado = await operar('readwrite', (s) => s.put(cliente, RECORD))
        // La escritura ha fallado pero antes sí se pudo leer: el almacenamiento
        // se ha vuelto inaccesible a media sesión. localStorage como red.
        if (guardado === null) escribirLs(cliente)
      } catch (err) {
        console.warn('[queryPersister] no se ha podido guardar la caché:', err)
      }
    }
  }

  // `escribiendo` se suelta en un `.then` y no dentro de vaciarPendiente. En
  // los modos sin IndexedDB el bucle no espera a nada y termina en el mismo
  // tick, ANTES de que `??=` asigne su resultado: soltarlo dentro dejaba
  // `escribiendo` apuntando para siempre a una promesa ya resuelta, y todas
  // las escrituras siguientes de la sesión se perdían sin hacer ruido.
  // Y si mientras se cerraba una tanda llegó otra, se encadena en vez de
  // quedarse apuntada sin nadie que la escriba.
  function lanzar(): Promise<void> {
    return vaciarPendiente().then(() => {
      if (pendiente) return lanzar()
      escribiendo = null
    })
  }

  return {
    persistClient(cliente) {
      pendiente = cliente
      escribiendo ??= lanzar()
      return escribiendo
    },

    async restoreClient() {
      // Sin IndexedDB (modo privado de algún Safari viejo) se trabaja
      // exclusivamente contra localStorage, como hacía la app antes.
      if (!hayIndexedDB()) {
        modo = 'solo-localstorage'
        return leerLs()
      }

      // `operar` distingue las dos cosas que aquí NO son lo mismo:
      //   null      → no se ha podido leer (error, o el plazo de `abrir`)
      //   undefined → se ha leído bien y no hay nada guardado (primera vez)
      const guardado = await operar<PersistedClient | undefined>('readonly', (s) => s.get(RECORD))
      if (guardado === null) {
        modo = 'lectura-fallida'
        console.warn('[queryPersister] no se ha podido leer IndexedDB; esta sesión no persiste nada')
        return undefined
      }

      if (guardado) {
        // Ya se migró en un arranque anterior; lo que quede en localStorage es
        // peso muerto de hasta varios megas.
        borrarLs()
        return guardado
      }

      // Primera vez tras actualizar: la copia buena está en localStorage.
      const antiguo = leerLs()
      if (!antiguo) return undefined

      // Pasarla a IndexedDB antes de devolverla, para que el siguiente arranque
      // ya no dependa de localStorage. OJO: solo se borra de localStorage si la
      // copia ha ido bien de verdad.
      const copiado = await operar('readwrite', (s) => s.put(antiguo, RECORD))
      if (copiado !== null) borrarLs()
      return antiguo
    },

    async removeClient() {
      pendiente = null
      // Un borrado explícito (cerrar sesión, caché caducada) sí se ejecuta
      // aunque la lectura hubiera fallado: aquí el objetivo es justamente que
      // no quede nada.
      await operar('readwrite', (s) => s.delete(RECORD))
      borrarLs()
    },
  }
}

/** Borra la caché persistida. La usa «borrar todo lo descargado» (offlineIndex). */
export async function clearPersistedQueries(): Promise<void> {
  await operar('readwrite', (s) => s.delete(RECORD))
  borrarLs()
}
