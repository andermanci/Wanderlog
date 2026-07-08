import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface AudioguideSyncState {
  stopId: string
  positionSeconds: number
  isPlaying: boolean
  sentAt: number
}

interface Options {
  audioguideId: string
  userId: string
}

// Canal de Supabase Realtime (Broadcast + Presence) compartido por todos los
// acompañantes de viaje que tengan abierta la misma audioguía. No hay "host":
// cualquiera que esté unido puede emitir un nuevo estado (parada, posición,
// play/pausa) que todos los demás aplican sobre su propio <audio>.
export function useAudioguideGroupPlayback({ audioguideId, userId }: Options) {
  const [joined, setJoined] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [remoteState, setRemoteState] = useState<AudioguideSyncState | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => () => {
    channelRef.current?.unsubscribe()
    channelRef.current = null
  }, [audioguideId])

  const join = useCallback(async () => {
    if (channelRef.current) return

    // Arranca ya sincronizado con lo último conocido (por si alguien más
    // lleva un rato escuchando en grupo).
    const { data } = await supabase
      .from('audioguides')
      .select('playback_stop_id, playback_position_seconds, playback_is_playing, playback_updated_at')
      .eq('id', audioguideId)
      .maybeSingle()
    if (data?.playback_stop_id) {
      setRemoteState({
        stopId: data.playback_stop_id,
        positionSeconds: data.playback_position_seconds,
        isPlaying: data.playback_is_playing,
        sentAt: new Date(data.playback_updated_at).getTime(),
      })
    }

    const channel = supabase.channel(`audioguide-playback:${audioguideId}`, {
      config: { presence: { key: userId } },
    })
    channel
      .on('broadcast', { event: 'sync_state' }, ({ payload }) => {
        setRemoteState(payload as AudioguideSyncState)
      })
      .on('presence', { event: 'sync' }, () => {
        setParticipantCount(Object.keys(channel.presenceState()).length)
      })
    channelRef.current = channel

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ joinedAt: Date.now() })
        setJoined(true)
      }
    })
  }, [audioguideId, userId])

  const leave = useCallback(() => {
    channelRef.current?.unsubscribe()
    channelRef.current = null
    setJoined(false)
    setParticipantCount(0)
  }, [])

  const sendState = useCallback(async (state: Omit<AudioguideSyncState, 'sentAt'>) => {
    const sentAt = Date.now()
    channelRef.current?.send({ type: 'broadcast', event: 'sync_state', payload: { ...state, sentAt } })
    await supabase.from('audioguides').update({
      playback_stop_id: state.stopId,
      playback_position_seconds: state.positionSeconds,
      playback_is_playing: state.isPlaying,
      playback_updated_at: new Date(sentAt).toISOString(),
    }).eq('id', audioguideId)
  }, [audioguideId])

  return { joined, participantCount, remoteState, join, leave, sendState }
}
