import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wanderlog — Tu diario de viajes',
        short_name: 'Wanderlog',
        description: 'Planifica, organiza y recuerda cada aventura.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#bf4d22',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // SPA: el service worker sirve index.html para cualquier ruta.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/auth\//, /supabase/],
        runtimeCaching: [
          {
            // Adjuntos, portadas, DNIs y QRs de Supabase Storage: offline 60 días.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OpenCV + jscanify (recorte automático de documentos), bajo demanda.
            urlPattern: /^https:\/\/(docs\.opencv\.org|cdn\.jsdelivr\.net\/npm\/jscanify).*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'doc-scan-libs',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fuentes de Google
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imágenes de Unsplash (portadas por defecto)
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unsplash',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
