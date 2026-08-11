import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export interface MyLocation {
  /** Última posición conocida, o null si no se está siguiendo. */
  pos: { lat: number; lng: number } | null
  /** El seguimiento está activo. */
  following: boolean
  /** Esperando el primer fix (para el spinner del botón). */
  locating: boolean
  /** Activa o desactiva el seguimiento. */
  toggle: () => void
  /** Corta el seguimiento (por ejemplo al cerrar el mapa). */
  stop: () => void
}

// Modo "seguirme": watchPosition mientras caminas, con el primer fix marcado
// aparte para poder centrar el mapa solo la primera vez. Extraído del mapa del
// viaje para poder reutilizarlo en el mapa de la audioguía.
export function useMyLocation(onFix?: (pos: { lat: number; lng: number }, first: boolean) => void): MyLocation {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [following, setFollowing] = useState(false)
  const [locating, setLocating] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const firstFixRef = useRef(true)
  // El callback cambia en cada render del componente que lo usa; por el ref no
  // hace falta que sea estable ni reiniciar el watch cuando cambie.
  const onFixRef = useRef(onFix)
  useEffect(() => { onFixRef.current = onFix })

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setFollowing(false)
    setLocating(false)
  }, [])

  const toggle = useCallback(() => {
    if (watchIdRef.current != null) { stop(); return }
    if (!('geolocation' in navigator)) { toast.error('Tu navegador no soporta geolocalización'); return }
    setLocating(true)
    setFollowing(true)
    firstFixRef.current = true
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPos(next)
        setLocating(false)
        onFixRef.current?.(next, firstFixRef.current)
        firstFixRef.current = false
      },
      (err) => {
        toast.error(err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
          : 'No se pudo obtener tu ubicación')
        stop()
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [stop])

  // Nunca dejar un watch vivo al desmontar.
  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
  }, [])

  return { pos, following, locating, toggle, stop }
}
