import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Audioguide, AudioguideStop } from '@/types/database'
import type { ParsedAudioguideStop } from '@/lib/audioguide/parseAudioguideText'
import {
  scopeColumn, scopeKey, stopStoragePath, stopStoragePrefix, type AudioguideScope,
} from '@/lib/audioguide/scope'
import { removeAudios } from '@/lib/audioCache'
import { toast } from 'sonner'

export interface AudioguideWithStops extends Audioguide {
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
        .select('*')
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
export function useGenerateStopAudio(tripId: string, scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stop, userId }: { stop: AudioguideStop; userId: string }) => {
      await supabase.from('audioguide_stops').update({ status: 'generating' }).eq('id', stop.id)
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })

      const path = stopStoragePath(userId, tripId, scope, stop.id)
      const { data, error } = await supabase.functions.invoke('audioguide-tts', {
        body: { stopId: stop.id, text: stop.script_text, path },
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
          audio_url: data.audioUrl,
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

// Borra la audioguía (y sus paradas por cascade) más los MP3 del storage, para regenerar desde cero.
export function useDeleteAudioguide(tripId: string, scope: AudioguideScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audioguideId, userId }: { audioguideId: string; userId: string }) => {
      // Los MP3 descargados para escucharlos sin conexión también sobran.
      const cached = qc.getQueryData<AudioguideWithStops | null>(audioguideKeys.byScope(scope))
      const cachedUrls = (cached?.stops ?? []).map((s) => s.audio_url).filter((u): u is string => !!u)
      if (cachedUrls.length > 0) await removeAudios(cachedUrls).catch(() => {})

      const prefix = stopStoragePrefix(userId, tripId, scope)
      const { data: files } = await supabase.storage.from('audioguides').list(prefix)
      if (files && files.length > 0) {
        await supabase.storage.from('audioguides').remove(files.map((f) => `${prefix}/${f.name}`))
      }
      const { error } = await supabase.from('audioguides').delete().eq('id', audioguideId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byScope(scope) })
      toast.success('Audioguía eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la audioguía'),
  })
}
