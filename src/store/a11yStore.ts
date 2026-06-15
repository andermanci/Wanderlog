import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'
export type TextSize = 'normal' | 'large'

interface A11yState {
  theme: Theme
  textSize: TextSize
  setTheme: (t: Theme) => void
  setTextSize: (s: TextSize) => void
}

export const useA11yStore = create<A11yState>()(
  persist(
    (set) => ({
      theme: 'system',
      textSize: 'normal',
      setTheme: (theme) => { set({ theme }); applyA11yPrefs() },
      setTextSize: (textSize) => { set({ textSize }); applyA11yPrefs() },
    }),
    { name: 'wanderlog-a11y' },
  ),
)

// Aplica tema (claro/oscuro/automático) y tamaño de texto al <html>.
// Tema por clase `.dark` (controlado por JS) para permitir el toggle manual
// además de seguir al sistema cuando está en "automático".
export function applyA11yPrefs() {
  if (typeof document === 'undefined') return
  const { theme, textSize } = useA11yStore.getState()
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('text-grande', textSize === 'large')
}

// Reacciona a cambios del tema del sistema cuando está en "automático".
export function initA11y() {
  applyA11yPrefs()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useA11yStore.getState().theme === 'system') applyA11yPrefs()
  })
}
