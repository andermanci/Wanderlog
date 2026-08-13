import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
import { audioguideKeys, type TripAudioguideReadiness } from '@/lib/queries/audioguides'
import { audioguideScope } from '@/lib/audioguide/scope'
import { cacheDoc } from '@/lib/docCache'
import { audioSize, cacheAudio } from '@/lib/audioCache'
import { cachePhoto, photosSize } from '@/lib/photoCache'
import { readOfflineIndex, writeOfflineIndex } from '@/lib/offlineIndex'
import type { Audioguide, AudioguideStop } from '@/types/database'

export type PrefetchProgress = {
  phase: 'data' | 'files' | 'photos' | 'audio'
  done: number
  total: number
}

export interface PrefetchOptions {
  onProgress?: (p: PrefetchProgress) => void
  /** Descargar las fotos del viaje (se guardan reducidas). */
  includePhotos?: boolean
  /** Descargar también los MP3 de las audioguías (pesan; se pregunta antes). */
  includeAudio?: boolean
}

/** Paradas del viaje con audio listo, en el orden en que se reproducen. */
async function readyAudioStops(tripId: string): Promise<AudioguideStop[]> {
  const { data, error } = await supabase
    .from('audioguide_stops')
    .select('*')
    .eq('trip_id', tripId)
    .eq('status', 'ready')
    .order('order_index')
  if (error) throw error
  return (data ?? []).filter((s) => !!s.audio_url)
}

/** Las fotos del viaje: portada, diario, adjuntos y portadas de las guías. */
async function tripPhotoUrls(tripId: string): Promise<string[]> {
  const [trip, journal, attachments, guides] = await Promise.all([
    supabase.from('trips').select('cover_image_url').eq('id', tripId).single(),
    supabase.from('journal_photos').select('file_url').eq('trip_id', tripId),
    supabase.from('activity_attachments').select('file_url, mime').eq('trip_id', tripId),
    supabase.from('destination_guides').select('cover_image_url').eq('trip_id', tripId),
  ])
  const urls = new Set<string>()
  const add = (u?: string | null) => { if (u && /^https?:\/\//.test(u)) urls.add(u) }
  add(trip.data?.cover_image_url)
  ;(journal.data ?? []).forEach((j) => add(j.file_url))
  ;(attachments.data ?? []).forEach((a) => {
    // Los adjuntos también pueden ser PDFs: solo nos llevamos las imágenes.
    if (a.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.file_url)) add(a.file_url)
  })
  ;(guides.data ?? []).forEach((g) => add(g.cover_image_url))
  return [...urls]
}

export interface DownloadSummary {
  photos: { count: number; bytes: number; exact: boolean }
  audio: { count: number; bytes: number; exact: boolean }
}

/**
 * Qué extras tiene el viaje y lo que ocupan, para poder elegir antes de
 * descargar. `exact` es false si algún tamaño se ha tenido que estimar.
 */
export async function tripDownloadSummary(tripId: string): Promise<DownloadSummary> {
  const [stops, photoUrls] = await Promise.all([
    readyAudioStops(tripId).catch(() => [] as AudioguideStop[]),
    tripPhotoUrls(tripId).catch(() => [] as string[]),
  ])
  const [audioSizes, photos] = await Promise.all([
    Promise.all(stops.map((s) => audioSize(s.audio_url as string, s.audio_duration_seconds))),
    photosSize(photoUrls),
  ])
  return {
    photos: { count: photoUrls.length, ...photos },
    audio: {
      count: stops.length,
      bytes: audioSizes.reduce((sum, s) => sum + s.bytes, 0),
      exact: audioSizes.every((s) => s.exact),
    },
  }
}

// Prefetchea TODOS los datos de un viaje (con las mismas query keys que usan los
// hooks) y calienta la caché de imágenes del service worker, para poder usar el
// viaje completo sin conexión sin tener que visitar cada sección.
export async function prefetchTripOffline(
  qc: QueryClient,
  tripId: string,
  { onProgress, includePhotos = true, includeAudio = false }: PrefetchOptions = {},
): Promise<void> {
  const sel = (table: string, order?: { col: string; asc?: boolean }) => async () => {
    let q = supabase.from(table).select('*').eq('trip_id', tripId)
    if (order) q = q.order(order.col, { ascending: order.asc ?? true, nullsFirst: false })
    const { data, error } = await q
    if (error) throw error
    return data
  }

  // 1) Datos. `key` es la query key real del hook; las tareas sin `key` solo se
  // descargan (las audioguías se cachean por actividad, más abajo).
  const tasks: { name: string; key?: readonly unknown[]; fn: () => Promise<unknown> }[] = [
    { name: 'trip', key: tripKeys.detail(tripId), fn: async () => {
      const { data, error } = await supabase.from('trips').select('*').eq('id', tripId).single()
      if (error) throw error
      return data
    } },
    { name: 'days', key: itineraryKeys.days(tripId), fn: sel('itinerary_days', { col: 'date' }) },
    { name: 'activities', key: itineraryKeys.activities(tripId), fn: sel('activities', { col: 'order_index' }) },
    { name: 'documents', key: docKeys.all(tripId), fn: sel('documents', { col: 'datetime_start' }) },
    { name: 'travelers', key: travelerKeys.all(tripId), fn: sel('travelers', { col: 'created_at' }) },
    { name: 'expenses', key: expenseKeys.all(tripId), fn: sel('expenses', { col: 'date', asc: false }) },
    { name: 'packing', key: packingKeys.all(tripId), fn: sel('packing_items', { col: 'created_at' }) },
    { name: 'reminders', key: reminderKeys.byTrip(tripId), fn: sel('reminders', { col: 'remind_at' }) },
    { name: 'places', key: placeKeys.all(tripId), fn: sel('favorite_places', { col: 'created_at' }) },
    { name: 'journal', key: journalKeys.photos(tripId), fn: sel('journal_photos', { col: 'created_at' }) },
    { name: 'attachments', key: attachmentKeys.byTrip(tripId), fn: sel('activity_attachments', { col: 'created_at' }) },
    { name: 'guides', key: guideKeys.all(tripId), fn: async () => {
      const { data, error } = await supabase
        .from('destination_guides').select('*').eq('trip_id', tripId)
        .order('order_index').order('created_at')
      if (error) throw error
      return data ?? []
    } },
    { name: 'audioguides', fn: sel('audioguides') },
    { name: 'audioStops', fn: sel('audioguide_stops', { col: 'order_index' }) },
  ]

  let done = 0
  const total = tasks.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Record<string, any> = {}
  await Promise.all(tasks.map(async (t) => {
    results[t.name] = await (t.key
      ? qc.ensureQueryData({ queryKey: t.key, queryFn: t.fn })
      : t.fn()
    ).catch(() => null)
    onProgress?.({ phase: 'data', done: ++done, total })
  }))

  // Las audioguías se cachean por ámbito (audioguideKeys.byScope), no por
  // viaje: se traen enteras de una vez y se reparten a mano en la caché, con la
  // misma forma que devuelve useAudioguide. Cada una cuelga de una actividad o
  // de un día, nunca de las dos (audioguides_scope_chk, ver 056).
  const audioguides: Audioguide[] = results.audioguides ?? []
  const audioStops: AudioguideStop[] = results.audioStops ?? []
  const readiness: TripAudioguideReadiness = { activityIds: [], dayIds: [] }
  for (const guide of audioguides) {
    const scope = audioguideScope(guide)
    if (!scope) continue
    const stops = audioStops
      .filter((s) => s.audioguide_id === guide.id)
      .sort((a, b) => a.order_index - b.order_index)
    qc.setQueryData(audioguideKeys.byScope(scope), { ...guide, stops })
    if (stops.length > 0 && stops.every((s) => s.status === 'ready')) {
      if (scope.kind === 'activity') readiness.activityIds.push(scope.id)
      else readiness.dayIds.push(scope.id)
    }
  }
  if (audioguides.length > 0) {
    qc.setQueryData(audioguideKeys.readinessByTrip(tripId), readiness)
  }

  // 2) Fotos: portada, diario, adjuntos y portadas de las guías.
  const urls = new Set<string>()
  const add = (u?: string | null) => { if (u && /^https?:\/\//.test(u)) urls.add(u) }
  add(results.trip?.cover_image_url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(results.journal ?? []).forEach((j: any) => add(j.file_url))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(results.attachments ?? []).forEach((a: any) => {
    if (a.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.file_url)) add(a.file_url)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(results.guides ?? []).forEach((g: any) => add(g.cover_image_url))

  // Los documentos (bucket privado) no pasan por el service worker: se leen con
  // URLs firmadas, que cambian en cada petición y nunca acertarían en su caché.
  // Los descargamos como blobs a nuestra propia caché, indexados por path.
  const docPaths = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(results.documents ?? []).forEach((d: any) => {
    if (d.file_url) docPaths.add(d.file_url)
    if (d.back_url) docPaths.add(d.back_url)
  })

  // Tipos de cambio en la divisa del viaje: el conversor funciona offline.
  if (results.trip?.default_currency) {
    const currency = results.trip.default_currency as string
    await qc.ensureQueryData({
      queryKey: ['rates', currency],
      queryFn: async () => {
        const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`)
        if (!res.ok) throw new Error('rates')
        const data = await res.json()
        return (data?.rates ?? {}) as Record<string, number>
      },
    }).catch(() => null)
  }

  // Los documentos van siempre: pesan poco y son lo que de verdad necesitas a
  // mano sin cobertura (pasaporte, billetes).
  const docs = [...docPaths]
  let bytes = 0
  let docsDone = 0
  await Promise.all(docs.map((p) => cacheDoc(p)
    .then((n) => { bytes += n })
    .catch(() => {})
    .then(() => onProgress?.({ phase: 'files', done: ++docsDone, total: docs.length }))))

  // 3) Fotos, si se han aceptado: se guardan reducidas (ver photoCache).
  const photos = includePhotos ? [...urls] : []
  let photosDone = 0
  if (photos.length > 0) onProgress?.({ phase: 'photos', done: 0, total: photos.length })
  await Promise.all(photos.map((u) => cachePhoto(u)
    .then((n) => { bytes += n })
    .catch(() => {})
    .then(() => onProgress?.({ phase: 'photos', done: ++photosDone, total: photos.length }))))

  // 4) Audios de las audioguías, solo si se han aceptado: son con diferencia lo
  // más pesado del viaje. De uno en uno para no saturar la red del móvil y para
  // que el progreso avance de verdad.
  const audios = includeAudio
    ? audioStops.filter((s) => s.status === 'ready' && s.audio_url).map((s) => s.audio_url as string)
    : []
  let audioDone = 0
  if (audios.length > 0) onProgress?.({ phase: 'audio', done: 0, total: audios.length })
  for (const url of audios) {
    bytes += await cacheAudio(url).catch(() => 0)
    onProgress?.({ phase: 'audio', done: ++audioDone, total: audios.length })
  }

  // Deja constancia de lo descargado para poder borrarlo después.
  const previous = readOfflineIndex(tripId)
  writeOfflineIndex(tripId, {
    photos: [...new Set([...(previous?.photos ?? []), ...photos])],
    audios: Math.max(previous?.audios ?? 0, audios.length),
    docs: [...new Set([...(previous?.docs ?? []), ...docs])],
    bytes: (previous?.bytes ?? 0) + bytes,
  })
}
