import type { QueryClient } from '@tanstack/react-query'
import { tripKeys } from '@/lib/queries/trips'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { docKeys } from '@/lib/queries/documents'
import { travelerKeys } from '@/lib/queries/travelers'
import { expenseKeys } from '@/lib/queries/expenses'
import { packingKeys } from '@/lib/queries/packing'
import { reminderKeys } from '@/lib/queries/reminders'
import { placeKeys } from '@/lib/queries/places'
import { journalKeys } from '@/lib/queries/journal'
import { attachmentKeys } from '@/lib/queries/attachments'
import { guideKeys } from '@/lib/queries/guide'
import { audioguideKeys } from '@/lib/queries/audioguides'
import { removeDocs, clearDocCache } from '@/lib/docCache'
import { removeTripAudios, clearAudioCache, formatBytes } from '@/lib/audioCache'
import { removePhotos, clearPhotoCache } from '@/lib/photoCache'
import { clearPersistedQueries } from '@/lib/queryPersister'
import type { Activity, ItineraryDay } from '@/types/database'

// Qué se descargó de cada viaje. Guardar la lista exacta de ficheros (y no
// deducirla luego de los datos) es lo que permite borrar la copia sin conexión
// aunque el viaje haya cambiado desde entonces.
export interface OfflineIndex {
  photos: string[]
  /**
   * CUÁNTOS audios se descargaron, no cuáles: se borran por la ruta del bucket,
   * que ya lleva el id del viaje. Antes se guardaba la lista entera de URLs y
   * en un viaje con 487 paradas ocupaba unos 80 KB que no cabían en
   * localStorage: la descarga terminaba bien y moría al anotarla.
   */
  audios: number
  docs: string[]
  bytes: number
}

const PREFIX = 'wanderlog-offline-'
const KEY = (tripId: string) => `${PREFIX}${tripId}`

export function readOfflineIndex(tripId: string): OfflineIndex | null {
  const raw = localStorage.getItem(KEY(tripId))
  if (!raw) return null
  // Copias guardadas antes de que existiera el índice: solo sabemos que existen.
  if (raw === '1') return { photos: [], audios: 0, docs: [], bytes: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineIndex> & { audios?: number | string[] }
    return {
      photos: parsed.photos ?? [],
      // Copias hechas cuando se guardaba la lista de URLs: nos quedamos con
      // cuántas eran, que es lo único que se usa.
      audios: Array.isArray(parsed.audios) ? parsed.audios.length : parsed.audios ?? 0,
      docs: parsed.docs ?? [],
      bytes: parsed.bytes ?? 0,
    }
  } catch {
    return null
  }
}

/** Qué trajo la copia, en corto: «124 MB · con fotos y audios». */
export function describeOfflineIndex(index: OfflineIndex): string {
  const extras = [
    index.photos.length > 0 ? 'fotos' : null,
    index.audios > 0 ? 'audios' : null,
  ].filter(Boolean)
  return [
    index.bytes > 0 ? formatBytes(index.bytes) : null,
    extras.length > 0 ? `con ${extras.join(' y ')}` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * Anota lo descargado. NUNCA lanza: la descarga ya ha terminado bien y quedarse
 * sin sitio para la anotación no puede convertirse en «no se pudo guardar todo
 * sin conexión». Si el índice completo no cabe, se deja al menos la marca
 * mínima («1»), que readOfflineIndex entiende desde siempre.
 */
export function writeOfflineIndex(tripId: string, index: OfflineIndex) {
  try {
    localStorage.setItem(KEY(tripId), JSON.stringify(index))
  } catch {
    try { localStorage.setItem(KEY(tripId), '1') } catch { /* almacenamiento lleno del todo */ }
  }
}

/**
 * Borra la copia sin conexión de un viaje: los ficheros descargados y los datos
 * guardados en la caché de queries. Lo que siga en el servidor no se toca.
 */
export async function deleteTripOffline(qc: QueryClient, tripId: string): Promise<void> {
  const index = readOfflineIndex(tripId)
  if (index) {
    await Promise.all([
      removePhotos(index.photos).catch(() => {}),
      // Por ruta, no por lista: así también se limpian las copias antiguas y
      // las que se guardaron sin poder anotar el índice.
      removeTripAudios(tripId).catch(() => {}),
      removeDocs(index.docs).catch(() => {}),
    ])
  }

  // Las audioguías se cachean por ámbito (actividad o día del itinerario), así
  // que hay que saber cuáles son antes de tirar esas dos listas.
  const activities = qc.getQueryData<Activity[]>(itineraryKeys.activities(tripId)) ?? []
  const days = qc.getQueryData<ItineraryDay[]>(itineraryKeys.days(tripId)) ?? []

  const keys: readonly (readonly unknown[])[] = [
    tripKeys.detail(tripId),
    itineraryKeys.days(tripId),
    itineraryKeys.activities(tripId),
    docKeys.all(tripId),
    travelerKeys.all(tripId),
    expenseKeys.all(tripId),
    packingKeys.all(tripId),
    reminderKeys.byTrip(tripId),
    placeKeys.all(tripId),
    journalKeys.photos(tripId),
    attachmentKeys.byTrip(tripId),
    guideKeys.all(tripId),
    audioguideKeys.readinessByTrip(tripId),
    ...activities.map((a) => audioguideKeys.byScope({ kind: 'activity', id: a.id })),
    ...days.map((d) => audioguideKeys.byScope({ kind: 'day', id: d.id })),
  ]
  for (const queryKey of keys) qc.removeQueries({ queryKey })

  localStorage.removeItem(KEY(tripId))
  // Marca antigua de "esta copia traía audios", ya no se usa.
  localStorage.removeItem(`${PREFIX}audio-${tripId}`)
}

/**
 * Pide al navegador que NO desaloje lo descargado.
 *
 * Por defecto, todo lo que guarda una web —IndexedDB, la Cache API, hasta el
 * registro del service worker— es «best-effort»: el sistema puede tirarlo
 * cuando le falta disco. No es teórico: probando esto en un Mac con el disco al
 * 99 % se vio desaparecer de golpe la base de datos, las cachés y el propio
 * service worker de un origen entero. En un móvil casi lleno, eso es quedarse
 * sin el viaje descargado justo cuando no hay cobertura.
 *
 * `navigator.storage.persist()` cambia ese modo a «persistente», que el sistema
 * solo desaloja como último recurso. Cada navegador lo concede con su propia
 * heurística y nadie garantiza un sí, así que esto devuelve el resultado pero
 * nunca lanza ni bloquea: es una mejora, no un requisito.
 *
 * MEDIDO en iOS 26 (Safari del simulador): en una pestaña normal responde que
 * NO. Apple lo reserva para las webs añadidas a la pantalla de inicio, que es
 * donde de verdad importa —y es un argumento más para instalarla ahí en vez de
 * usarla como pestaña—. En Chrome se concede con poco uso previo.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Lo que ocupa la app en este dispositivo, si el navegador lo cuenta. */
export async function offlineUsageBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return estimate?.usage ?? null
  } catch {
    return null
  }
}

/**
 * Borra TODO lo descargado en este dispositivo: fotos, audios, documentos y los
 * datos guardados de todos los viajes. No toca la cola de cambios sin subir
 * (wanderlog-outbox), que no es una descarga sino trabajo pendiente de enviar.
 */
export async function clearAllOffline(qc: QueryClient): Promise<void> {
  await Promise.all([
    clearDocCache().catch(() => {}),
    clearAudioCache().catch(() => {}),
    clearPhotoCache().catch(() => {}),
  ])
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  }
  qc.clear()
  // La caché persistida vive en IndexedDB desde que dejó de caber en
  // localStorage (ver src/lib/queryPersister.ts).
  await clearPersistedQueries().catch(() => {})
}
