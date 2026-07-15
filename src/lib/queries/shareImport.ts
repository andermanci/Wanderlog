import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PlaceCategory } from '@/types/database'

// Lo que devuelve la edge function share-import (ver supabase/functions/share-import).
export interface SharedPlaceGuess {
  placeName: string | null
  city: string | null
  country: string | null
  category: PlaceCategory
  why: string | null
  platform: 'tiktok' | 'instagram' | 'web'
  thumbnailUrl: string | null
  sourceText: string | null
  // true cuando no se pudo leer el texto del enlace (típico de Instagram): el
  // usuario tendrá que pegar el caption a mano y reintentar con `manualText`.
  needsManualText: boolean
}

// Llama a la edge function con un enlace (o con el texto pegado a mano) y
// devuelve el sitio que ha entendido. No persiste nada: solo interpreta.
export function useInterpretSharedLink() {
  return useMutation({
    mutationFn: async ({ url, manualText }: { url?: string; manualText?: string }) => {
      const { data, error } = await supabase.functions.invoke('share-import', {
        body: { url, manualText },
      })
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? 'No se pudo leer el enlace')
      }
      return data as SharedPlaceGuess
    },
  })
}
