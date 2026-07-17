import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Audioguide, AudioguideStop } from '@/types/database'
import type { ParsedAudioguideStop } from '@/lib/audioguide/parseAudioguideText'
import { toast } from 'sonner'

export interface AudioguideWithStops extends Audioguide {
  stops: AudioguideStop[]
}

export const audioguideKeys = {
  byActivity: (activityId: string) => ['audioguide', 'activity', activityId] as const,
  readinessByTrip: (tripId: string) => ['audioguide', 'trip-readiness', tripId] as const,
}

function storagePath(userId: string, tripId: string, activityId: string, stopId: string) {
  return `${userId}/${tripId}/${activityId}/${stopId}.mp3`
}

// Audioguía de la actividad (si existe) con sus paradas ordenadas.
export function useAudioguide(activityId: string) {
  return useQuery({
    queryKey: audioguideKeys.byActivity(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<AudioguideWithStops | null> => {
      const { data: audioguide, error } = await supabase
        .from('audioguides')
        .select('*')
        .eq('activity_id', activityId)
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

// Ids de actividad del viaje que ya tienen una audioguía con todas sus
// paradas listas (para pintar un icono en el listado del itinerario).
// Devuelve un array (no un Set) porque la caché de React Query se persiste
// en localStorage vía JSON.stringify, que no conserva instancias de Set.
export function useTripAudioguidesReadiness(tripId: string) {
  return useQuery({
    queryKey: audioguideKeys.readinessByTrip(tripId),
    enabled: !!tripId,
    queryFn: async (): Promise<string[]> => {
      const { data: guides, error } = await supabase
        .from('audioguides')
        .select('id, activity_id')
        .eq('trip_id', tripId)
      if (error) throw error
      if (!guides || guides.length === 0) return []

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

      const readyActivityIds: string[] = []
      for (const g of guides) {
        const statuses = statusesByGuide.get(g.id) ?? []
        if (statuses.length > 0 && statuses.every((s) => s === 'ready')) {
          readyActivityIds.push(g.activity_id)
        }
      }
      return readyActivityIds
    },
  })
}

// Crea la audioguía (estado 'generating') junto con sus paradas (estado 'pending').
export function useCreateAudioguide(tripId: string, activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rawText, parsedStops }: { rawText: string; parsedStops: ParsedAudioguideStop[] }) => {
      const { data: audioguide, error } = await supabase
        .from('audioguides')
        .insert({ activity_id: activityId, trip_id: tripId, raw_text: rawText, status: 'generating' })
        .select()
        .single()
      if (error) throw error

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
          status: 'pending' as const,
        })))
        .select()
      if (stopsErr) throw stopsErr

      return { ...audioguide, stops: stops ?? [] } as AudioguideWithStops
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byActivity(activityId) })
    },
    onError: () => toast.error('No se pudo guardar el guion de la audioguía'),
  })
}

// Sintetiza el audio de una parada (llama a la edge function) y guarda el resultado.
export function useGenerateStopAudio(tripId: string, activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stop, userId }: { stop: AudioguideStop; userId: string }) => {
      await supabase.from('audioguide_stops').update({ status: 'generating' }).eq('id', stop.id)
      qc.invalidateQueries({ queryKey: audioguideKeys.byActivity(activityId) })

      const path = storagePath(userId, tripId, activityId, stop.id)
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
      qc.invalidateQueries({ queryKey: audioguideKeys.byActivity(activityId) })
    },
  })
}

// Marca la audioguía como lista (todas las paradas generadas) o con error.
export function useSetAudioguideStatus(activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audioguideId, status }: { audioguideId: string; status: Audioguide['status'] }) => {
      const { error } = await supabase.from('audioguides').update({ status }).eq('id', audioguideId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: audioguideKeys.byActivity(activityId) }),
  })
}

// Borra la audioguía (y sus paradas por cascade) más los MP3 del storage, para regenerar desde cero.
export function useDeleteAudioguide(tripId: string, activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ audioguideId, userId }: { audioguideId: string; userId: string }) => {
      const prefix = `${userId}/${tripId}/${activityId}`
      const { data: files } = await supabase.storage.from('audioguides').list(prefix)
      if (files && files.length > 0) {
        await supabase.storage.from('audioguides').remove(files.map((f) => `${prefix}/${f.name}`))
      }
      const { error } = await supabase.from('audioguides').delete().eq('id', audioguideId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: audioguideKeys.byActivity(activityId) })
      toast.success('Audioguía eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la audioguía'),
  })
}
