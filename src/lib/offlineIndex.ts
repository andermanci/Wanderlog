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
import type { Activity } from '@/types/database'

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
// La caché de queries persistida, que es donde viven los datos descargados.
const QUERY_CACHE_KEY = 'wanderlog-cache'

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

  // Las audioguías se cachean por actividad, así que hay que saber cuáles son
  // antes de tirar la lista de actividades.
  const activities = qc.getQueryData<Activity[]>(itineraryKeys.activities(tripId)) ?? []

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
    ...activities.map((a) => audioguideKeys.byActivity(a.id)),
  ]
  for (const queryKey of keys) qc.removeQueries({ queryKey })

  localStorage.removeItem(KEY(tripId))
  // Marca antigua de "esta copia traía audios", ya no se usa.
  localStorage.removeItem(`${PREFIX}audio-${tripId}`)
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
  localStorage.removeItem(QUERY_CACHE_KEY)
}
