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
        // Incluye .webp para precachear las portadas fallback empaquetadas,
        // .mjs para el worker de pdf.js (detección de códigos del wallet
        // offline) y .wav para silencio.wav, el ancla de sesión de audio del
        // reproductor de audioguías: si no estuviera sin conexión, cambiar de
        // parada dejaría de sonar justo cuando no hay cobertura.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webp,wav}'],
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
        // Compartir a Wanderlog desde TikTok/Instagram/navegador (Android): la
        // app aparece en el menú "Compartir" y abre /import/shared con el enlace.
        // GET => el SO navega a la URL con los parámetros; el NavigationRoute del
        // service worker ya sirve index.html, no hace falta tocar sw.ts. (iOS no
        // soporta share_target en PWA: allí se pega el enlace o se usa un Atajo.)
        share_target: {
          action: '/import/shared',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Las librerías pesadas van a su propio chunk: FullCalendar solo lo
        // necesita /calendar, Recharts solo /expenses y Maps solo /map. Antes
        // se descargaban todas para poder pintar la pantalla de login.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@fullcalendar') || id.includes('ical.js')) return 'fullcalendar'
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('@vis.gl/react-google-maps')) return 'maps'
          // pdf.js + ZXing solo los usa el Wallet (detección de QR/códigos).
          if (id.includes('pdfjs-dist') || id.includes('@zxing')) return 'wallet-codes'
          if (/react-markdown|remark-|micromark|mdast|hast|turndown/.test(id)) return 'markdown'
        },
      },
    },
  },
})
