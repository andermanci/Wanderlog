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
import { cacheDoc } from '@/lib/docCache'

// Prefetchea TODOS los datos de un viaje (con las mismas query keys que usan los
// hooks) y calienta la caché de imágenes del service worker, para poder usar el
// viaje completo sin conexión sin tener que visitar cada sección.
export async function prefetchTripOffline(
  qc: QueryClient,
  tripId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const sel = (table: string, order?: { col: string; asc?: boolean }) => async () => {
    let q = supabase.from(table).select('*').eq('trip_id', tripId)
    if (order) q = q.order(order.col, { ascending: order.asc ?? true, nullsFirst: false })
    const { data, error } = await q
    if (error) throw error
    return data
  }

  // 1) Datos (cada uno con la query key real del hook correspondiente).
  const tasks: { key: readonly unknown[]; fn: () => Promise<unknown> }[] = [
    { key: tripKeys.detail(tripId), fn: async () => {
      const { data, error } = await supabase.from('trips').select('*').eq('id', tripId).single()
      if (error) throw error
      return data
    } },
    { key: itineraryKeys.days(tripId), fn: sel('itinerary_days', { col: 'date' }) },
    { key: itineraryKeys.activities(tripId), fn: sel('activities', { col: 'order_index' }) },
    { key: docKeys.all(tripId), fn: sel('documents', { col: 'datetime_start' }) },
    { key: travelerKeys.all(tripId), fn: sel('travelers', { col: 'created_at' }) },
    { key: expenseKeys.all(tripId), fn: sel('expenses', { col: 'date', asc: false }) },
    { key: packingKeys.all(tripId), fn: sel('packing_items', { col: 'created_at' }) },
    { key: reminderKeys.byTrip(tripId), fn: sel('reminders', { col: 'remind_at' }) },
    { key: placeKeys.all(tripId), fn: sel('favorite_places', { col: 'created_at' }) },
    { key: journalKeys.photos(tripId), fn: sel('journal_photos', { col: 'created_at' }) },
    { key: attachmentKeys.byTrip(tripId), fn: sel('activity_attachments', { col: 'created_at' }) },
    // ⚠️ Añadir tareas nuevas SIEMPRE al final: el destructuring de `results`
    // de abajo es posicional.
    { key: guideKeys.all(tripId), fn: async () => {
      const { data, error } = await supabase
        .from('destination_guides').select('*').eq('trip_id', tripId)
        .order('order_index').order('created_at')
      if (error) throw error
      return data ?? []
    } },
  ]

  let done = 0
  const total = tasks.length + 1 // +1 para la fase de imágenes
  const results = await Promise.all(tasks.map(async (t) => {
    const data = await qc.ensureQueryData({ queryKey: t.key, queryFn: t.fn }).catch(() => null)
    onProgress?.(++done, total)
    return data as any // eslint-disable-line @typescript-eslint/no-explicit-any
  }))

  // 2) Calentar la caché de imágenes (el SW las guarda con CacheFirst).
  const urls = new Set<string>()
  const add = (u?: string | null) => { if (u && /^https?:\/\//.test(u)) urls.add(u) }
  const [trip, , , documents, , , , , places, journal, attachments, guides] = results
  add(trip?.cover_image_url)
  ;(places ?? []).forEach(() => {})
  ;(journal ?? []).forEach((j: any) => add(j.file_url)) // eslint-disable-line @typescript-eslint/no-explicit-any
  ;(attachments ?? []).forEach((a: any) => add(a.file_url)) // eslint-disable-line @typescript-eslint/no-explicit-any
  ;(guides ?? []).forEach((g: any) => add(g.cover_image_url)) // eslint-disable-line @typescript-eslint/no-explicit-any

  // Los documentos (bucket privado) no pasan por el service worker: se leen con
  // URLs firmadas, que cambian en cada petición y nunca acertarían en su caché.
  // Los descargamos como blobs a nuestra propia caché, indexados por path.
  const docPaths = new Set<string>()
  ;(documents ?? []).forEach((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (d.file_url) docPaths.add(d.file_url)
    if (d.back_url) docPaths.add(d.back_url)
  })

  // Tipos de cambio en la divisa del viaje: el conversor funciona offline.
  if (trip?.default_currency) {
    await qc.ensureQueryData({
      queryKey: ['rates', trip.default_currency],
      queryFn: async () => {
        const res = await fetch(`https://open.er-api.com/v6/latest/${trip.default_currency}`)
        if (!res.ok) throw new Error('rates')
        const data = await res.json()
        return (data?.rates ?? {}) as Record<string, number>
      },
    }).catch(() => null)
  }

  await Promise.all([
    ...[...urls].map((u) => fetch(u).catch(() => {})),
    ...[...docPaths].map((p) => cacheDoc(p).catch(() => {})),
  ])
  onProgress?.(total, total)
}
