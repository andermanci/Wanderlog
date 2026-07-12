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
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Incluye .webp para precachear las portadas fallback empaquetadas.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      },
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
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
