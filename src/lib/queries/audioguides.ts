import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Audioguide, AudioguideStop } from '@/types/database'
import type { ParsedAudioguideStop } from '@/lib/audioguide/parseAudioguideText'
import {
  scopeColumn, scopeKey, type AudioguideScope,
} from '@/lib/audioguide/scope'
import { removeAudios } from '@/lib/audioCache'
import { toast } from 'sonner'

// Todas las columnas MENOS raw_text.
//
// raw_text es el guion entero tal y como se pegó, y solo se ESCRIBE: nadie lo
// lee en toda la app —las paradas ya llevan su script_text troceado—. Pero
// entraba por un select('*') y de ahí a la caché que se persiste en
// localStorage, donde ocupaba más de 1 MB en un viaje con muchas audioguías.
// Como la cuota ronda los 5 MB, era peso muerto que echaba fuera datos que sí
// hacen falta sin conexión.
const COLUMNAS = 'id, activity_id, day_id, trip_id, status, playback_stop_id, playback_position_seconds, playback_is_playing, playback_rate, playback_updated_at, created_at'

/** Una audioguía tal y como la carga la app: sin el guion en bruto. */
export type AudioguideCargada = Omit<Audioguide, 'raw_text'>

export interface AudioguideWithStops extends AudioguideCargada {
  stops: AudioguideStop[]
}

/** Qué actividades y qué días del viaje ya tienen la audioguía lista. */
export interface TripAudioguideReadiness {
  activityIds: string[]
  dayIds: string[]
}

export const audioguideKeys = {
  byScope: (scope: AudioguideScope) => ['audioguide', 'scope', scopeKey(scope)] as const,
  readinessByTrip: (tripId: string) => ['audioguide', 'trip-readiness', tripId] as const,
}

// Audioguía del ámbito (si existe) con sus paradas ordenadas.
export function useAudioguide(scope: AudioguideScope | null) {
  return useQuery({
    queryKey: audioguideKeys.byScope(scope ?? { kind: 'activity', id: '' }),
    enabled: !!scope?.id,
    queryFn: async (): Promise<AudioguideWithStops | null> => {
      const { data: audioguide, error } = await supabase
        .from('audioguides')
        .select(COLUMNAS)
        .eq(scopeColumn(scope!), scope!.id)
        .maybeSingle()
      if (error) throw error
      if (!audioguide) return null

      const { data: stops, error: stopsErr } = await supabase
        .from('audioguide_stops')
        .select('*')
        .eq('audioguide_id', audioguide.id)
        .order('order_index')
      if (stopsErr) throw stopsErr

      return { ...audioguide, stops: stops ?? [] }
    },
  })
}

// Actividades y días del viaje que ya tienen una audioguía con todas sus
// paradas listas (para pintar un icono en el listado del itinerario).
// Devuelve arrays (no Sets) porque la caché de React Query se persiste en
// localStorage vía JSON.stringify, que no conserva instancias de Set.
export function useTripAudioguidesReadiness(tripId: string) {
  return useQuery({
    queryKey: audioguideKeys.readinessByTrip(tripId),
    enabled: !!tripId,
    queryFn: async (): Promise<TripAudioguideReadiness> => {
      const vacio: TripAudioguideReadiness = { activityIds: [], dayIds: [] }

      const { data: guides, error } = await supabase
        .from('audioguides')
        .select('id, activity_id, day_id')
        .eq('trip_id', tripId)
      if (error) throw error
      if (!guides || guides.length === 0) return vacio

      const { data: stops, error: stopsErr } = await supabase
        .from('audioguide_stops')
        .select('audioguide_id, status')
        .eq('trip_id', tripId)
      if (stopsErr) throw stopsErr

      const statusesByGuide = new Map<string, string[]>()
      for (const s of stops ?? []) {
        const arr = statusesByGuide.get(s.audioguide_id) ?? []
        arr.push(s.status)
        statusesByGuide.set(s.audioguide_id, arr)
      }

      const readiness: TripAudioguideReadiness = { activityIds: [], dayIds: [] }
      for (const g of guides) {
        const statuses = statusesByGuide.get(g.id) ?? []
        if (statuses.length === 0 || !statuses.every((s) => s === 'ready')) continue
        // Exactamente una de las dos está puesta (audioguides_scope_chk, ver 056).
        if (g.activity_id) readiness.activityIds.push(g.activity_id)
        else if (g.day_id) readiness.dayIds.push(g.day_id)
      }
      return readiness
    },
  })
}

// Crea la audioguía (estado 'generating') junto con sus paradas (estado 'pending').
export function useCreateAudioguide(tripId: string, scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rawText, parsedStops }: { rawText: string; parsedStops: ParsedAudioguideStop[] }) => {
      const { data: audioguide, error } = await supabase
        .from('audioguides')
        // Las dos columnas explícitas (y no una clave calculada) para que
        // TypeScript siga comprobando el insert contra el esquema.
        .insert({
          activity_id: scope.kind === 'activity' ? scope.id : null,
          day_id: scope.kind === 'day' ? scope.id : null,
          trip_id: tripId,
          raw_text: rawText,
          status: 'generating',
        })
        .select()
        .single()
      if (error) throw error

      // ¿El guion trae los campos de ubicación? Si los trae, un NINGUNO es una
      // respuesta deliberada («esta parada no es un sitio») y se marca como no
      // localizable. Si no los trae (guion de formato antiguo), se deja
      // pendiente para que la app lo intente con el geocodificador.
      const traeUbicacion = parsedStops.some((s) => s.coords || s.placeQuery)

      const { data: stops, error: stopsErr } = await supabase
        .from('audioguide_stops')
        .insert(parsedStops.map((s, i) => ({
          audioguide_id: audioguide.id,
          trip_id: tripId,
          order_index: i,
          title: s.title,
          summary: s.summary,
          direction_text: s.directionText,
          script_text: s.scriptText,
          place_query: s.placeQuery,
          // Coordenadas dadas por la IA que escribe el guion: si vienen, la
          // parada nace situada y no hace falta preguntarle a Google.
          lat: s.coords?.lat ?? null,
          lng: s.coords?.lng ?? null,
          // Con coordenadas ya está situada; con solo el nombre del sitio queda
          // pendiente de geocodificar; y si el guion traía los campos y esta
          // parada respondió NINGUNO, es que no es un sitio: no se localizará.
          geo_status: (s.coords ? 'located' : s.placeQuery || !traeUbicacion ? 'pending' : 'unlocated') as
            'located' | 'unlocated' | 'pending',
          status: 'pending' as const,
        })))
        .select()
      if (stopsErr) throw stopsErr

      return { ...audioguide, stops: stops ?? [] } as AudioguideWithStops
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })
    },
    onError: () => toast.error('No se pudo guardar el guion de la audioguía'),
  })
}

// Sintetiza el audio de una parada (llama a la edge function) y guarda el resultado.
export function useGenerateStopAudio(scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stop }: { stop: AudioguideStop }) => {
      await supabase.from('audioguide_stops').update({ status: 'generating' }).eq('id', stop.id)
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })

      // Ya no se manda `path`: la clave del fichero la decide el servidor. Antes
      // la elegía el cliente y la función se limitaba a mirar que empezara por
      // el id del usuario, lo cual comprobaba la forma de la ruta pero no que la
      // parada fuera suya. Ahora la deriva de la propia fila, tras verificar
      // permiso de edición sobre el viaje.
      const { data, error } = await supabase.functions.invoke('audioguide-tts', {
        body: { stopId: stop.id, text: stop.script_text },
      })
      if (error || data?.error) {
        await supabase.from('audioguide_stops')
          .update({ status: 'error', error_message: data?.error ?? error?.message ?? 'Error desconocido' })
          .eq('id', stop.id)
        throw new Error(data?.error ?? error?.message)
      }

      await supabase.from('audioguide_stops')
        .update({
          status: 'ready',
          // La CLAVE del objeto en R2, no una URL: quien la resuelve es
          // mediaUrl() con VITE_R2_PUBLIC_URL. `audioUrl` es el nombre que
          // devolvía antes la función, y se acepta mientras convivan las dos
          // versiones durante un despliegue.
          audio_url: data.audioKey ?? data.audioUrl,
          audio_bytes: data.audioBytes ?? null,
          audio_duration_seconds: data.durationSeconds ?? null,
          sentence_timings: data.sentenceTimings ?? null,
        })
        .eq('id', stop.id)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })
    },
  })
}

// Marca la audioguía como lista (todas las paradas generadas) o con error.
export function useSetAudioguideStatus(scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audioguideId, status }: { audioguideId: string; status: Audioguide['status'] }) => {
      const { error } = await supabase.from('audioguides').update({ status }).eq('id', audioguideId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) }),
  })
}

/**
 * Borra la audioguía (y sus paradas por cascade) más sus MP3, para regenerar
 * desde cero.
 *
 * El borrado de ficheros se hace en el servidor: viven en Cloudflare R2 y el
 * navegador no puede tener credenciales de escritura. Además la función borra
 * por las claves escritas en las filas, y no listando un prefijo con el id de
 * quien borra, que era lo que dejaba huérfanos los audios generados por otro
 * miembro del viaje.
 */
export function useDeleteAudioguide(scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audioguideId }: { audioguideId: string }) => {
      // Los MP3 descargados para escucharlos sin conexión también sobran. Esto
      // sí es local, así que se hace aquí y da igual si el servidor falla luego.
      const cached = qc.getQueryData<AudioguideWithStops | null>(audioguideKeys.byScope(scope))
      const cachedUrls = (cached?.stops ?? []).map((s) => s.audio_url).filter((u): u is string => !!u)
      if (cachedUrls.length > 0) await removeAudios(cachedUrls).catch(() => {})

      const { data, error } = await supabase.functions.invoke('audioguide-media', {
        body: { action: 'delete-audioguide', audioguideId },
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })
      toast.success('Audioguía eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la audioguía'),
  })
}
