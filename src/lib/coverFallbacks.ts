import cover1 from '@/assets/covers/cover-1506905925346-21bda4d32df4.webp'
import cover2 from '@/assets/covers/cover-1476514525535-07fb3b4ae5f1.webp'
import cover3 from '@/assets/covers/cover-1501854140801-50d01698950b.webp'
import cover4 from '@/assets/covers/cover-1469854523086-cc02fe5d8800.webp'

// Portadas por defecto empaquetadas en el build (antes, URLs de Unsplash):
// el precache del Service Worker las incluye y funcionan sin conexión.
export const FALLBACK_COVERS = [cover1, cover2, cover3, cover4]

// Portada estable para un viaje sin imagen propia: mismo fallback en cada
// vista (tarjeta, cabecera…) derivándolo del id en vez del índice de lista.
export function fallbackCover(tripId: string): string {
  let hash = 0
  for (let i = 0; i < tripId.length; i++) hash = (hash * 31 + tripId.charCodeAt(i)) | 0
  return FALLBACK_COVERS[Math.abs(hash) % FALLBACK_COVERS.length]
}
