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

// SPA: servir index.html para navegaciones (salvo auth/supabase y el archivo
// del Atajo de iOS). Sin excluir el .shortcut, al tocar "Descargar el Atajo" el
// SW respondía index.html a la navegación y la app te devolvía al inicio en vez
// de descargar el archivo.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/auth\//, /supabase/, /\.shortcut$/, /^\/api\//],
}))

// AVISO PARA QUIEN TOQUE ESTE FICHERO: `/api/track` (la analítica) NO debe
// pasar nunca por el service worker. Hoy no pasa —es un POST, no una
// navegación, y no casa con ninguna ruta de abajo—, pero el día que alguien
// añada una regla genérica del mismo origen o un handler offline
// catch-all, los avisos de visita se encolarían y se subirían días después,
// ensuciando todas las series temporales sin que nadie se entere.

// ---- Cachés en tiempo de ejecución (réplica de la config anterior) ----
const cacheFirst = (cacheName: string, maxEntries: number, days: number) =>
  new CacheFirst({
    cacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries, maxAgeSeconds: 60 * 60 * 24 * days }),
    ],
  })

// Adjuntos, portadas y QRs de Supabase Storage (offline 60 días).
// Los documentos personales (DNI, pasaporte) NO pasan por aquí: su bucket es
// privado y se lee con URLs firmadas, cuya firma cambia en cada petición y por
// tanto nunca acertaría en esta caché. Los gestiona la app en src/lib/docCache.ts.
// Los audios (destination === 'audio', ej. audioguías) se excluyen a
// propósito: la interceptación de peticiones Range de audio/vídeo por un
// Service Worker es poco fiable en Safari/WebKit (tanto Mac como iOS) pase
// lo que pase con los plugins de Workbox — se ha comprobado que falla ahí
// incluso con RangeRequestsPlugin. Mejor dejar que el audio vaya siempre
// directo a la red, sin pasar por el Service Worker ni la Cache API, donde
// el propio navegador gestiona Range/CORS de forma nativa y fiable.
// Nombre de caché con sufijo -v2 para descartar entradas viejas cacheadas
// antes de añadir soporte de Range requests.
//
// DESDE LA MUDANZA A R2, esta regla ya no ve los MP3 en absoluto: viven en otro
// host y el patrón solo casa `.supabase.co`. Eso arregló de paso un derroche
// que había pasado desapercibido — `cacheAudio` los baja con fetch(), donde
// `request.destination` es '' y no 'audio', así que la exclusión de arriba no
// los filtraba y cada MP3 acababa guardado DOS veces: en wanderlog-audio-v1 y
// aquí, comiéndose entradas del tope de 500 que son de las fotos.
//
// NO AÑADIR NUNCA EL HOST DE R2 A ESTE PATRÓN. Reintroduciría exactamente el
// problema de Range en Safari que explica el párrafo de arriba. El audio lo
// gestiona la app en src/lib/audioCache.ts, a propósito y con su propia caché.
// La condición `destination !== 'audio'` se conserva como defensa en fondo.
registerRoute(
  ({ url, request }) =>
    request.destination !== 'audio' &&
    /\.supabase\.co\/storage\/v1\/object\/public\//.test(url.href),
  cacheFirst('supabase-storage-v2', 500, 60),
)
// OpenCV + jscanify (recorte de documentos), ambos del paquete jscanify.
registerRoute(
  ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/jscanify'),
  cacheFirst('doc-scan-libs', 8, 365),
)
// Fuentes de Google.
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  cacheFirst('google-fonts', 30, 365),
)
// Portadas de las guías del destino (Wikipedia/Wikimedia), para verlas offline.
registerRoute(
  ({ url }) => url.hostname === 'upload.wikimedia.org',
  cacheFirst('wiki-images', 100, 60),
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
