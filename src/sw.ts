/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()

// Precache de la app (JS/CSS/HTML generados en el build).
precacheAndRoute(self.__WB_MANIFEST)

// SPA: servir index.html para navegaciones (salvo auth/supabase).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/auth\//, /supabase/],
}))

// ---- Cachés en tiempo de ejecución (réplica de la config anterior) ----
const cacheFirst = (cacheName: string, maxEntries: number, days: number) =>
  new CacheFirst({
    cacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries, maxAgeSeconds: 60 * 60 * 24 * days }),
    ],
  })

// Adjuntos, portadas, DNIs y QRs de Supabase Storage (offline 60 días).
// Los audios (destination === 'audio', ej. audioguías) se excluyen a
// propósito: la interceptación de peticiones Range de audio/vídeo por un
// Service Worker es poco fiable en Safari/WebKit (tanto Mac como iOS) pase
// lo que pase con los plugins de Workbox — se ha comprobado que falla ahí
// incluso con RangeRequestsPlugin. Mejor dejar que el audio vaya siempre
// directo a la red, sin pasar por el Service Worker ni la Cache API, donde
// el propio navegador gestiona Range/CORS de forma nativa y fiable.
// Nombre de caché con sufijo -v2 para descartar entradas viejas cacheadas
// antes de añadir soporte de Range requests.
registerRoute(
  ({ url, request }) =>
    request.destination !== 'audio' &&
    /\.supabase\.co\/storage\/v1\/object\/public\//.test(url.href),
  cacheFirst('supabase-storage-v2', 500, 60),
)
// OpenCV + jscanify (recorte de documentos).
registerRoute(
  ({ url }) => url.hostname === 'docs.opencv.org' || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/jscanify')),
  cacheFirst('doc-scan-libs', 8, 365),
)
// Fuentes de Google.
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  cacheFirst('google-fonts', 30, 365),
)
// Imágenes de Unsplash (portadas por defecto).
registerRoute(
  ({ url }) => url.hostname === 'images.unsplash.com',
  cacheFirst('unsplash', 60, 30),
)

// ---- Notificaciones push (avisos del viaje) ----
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {}
  try { data = event.data?.json() ?? {} } catch { data = { body: event.data?.text() } }
  const title = data.title || 'Wanderlog'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = all.find((c): c is WindowClient => 'focus' in c)
    if (existing) {
      await existing.focus()
      if (existing.url !== url) await existing.navigate(url).catch(() => {})
    } else {
      await self.clients.openWindow(url)
    }
  })())
})
