import path from 'path'
import { defineConfig } from 'vitest/config'

// Configuración aparte de vite.config.ts a propósito: el plugin de la PWA y los
// tipos de Vitest no encajan en un mismo defineConfig, y así el build de
// producción no depende de nada de test.
//
// Se cubre la lógica pura y determinista: el reparto de gastos (src/lib/split.ts)
// y la cola offline (src/lib/offline.ts). Es donde un fallo silencioso cuesta
// caro: cuentas mal hechas y cambios perdidos.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
})
