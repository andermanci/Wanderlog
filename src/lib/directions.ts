// "Cómo llegar": enlaces a las apps de mapas del dispositivo. Compartido por
// el mapa, el TodayHub y el detalle de actividad.
export interface DirectionsTarget {
  name: string
  lat?: number | null
  lng?: number | null
  address?: string | null // fallback cuando la parada no tiene coordenadas
}

// En iOS/macOS ofrecemos Apple Maps; Google Maps y Waze siempre. Sin origen
// explícito: las apps parten de la ubicación actual del usuario.
export function navAppsFor(target: DirectionsTarget): { name: string; href: string }[] {
  const isApple = typeof navigator !== 'undefined' && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent)
  const hasCoords = target.lat != null && target.lng != null
  const dest = hasCoords ? `${target.lat},${target.lng}` : (target.address ?? '').trim()
  if (!dest) return []
  const enc = encodeURIComponent(dest)
  return [
    { name: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${enc}`, show: true },
    { name: 'Apple Maps', href: `https://maps.apple.com/?daddr=${enc}&dirflg=d`, show: isApple },
    {
      name: 'Waze',
      href: hasCoords ? `https://waze.com/ul?ll=${dest}&navigate=yes` : `https://waze.com/ul?q=${enc}&navigate=yes`,
      show: true,
    },
  ].filter(a => a.show).map(({ name, href }) => ({ name, href }))
}
