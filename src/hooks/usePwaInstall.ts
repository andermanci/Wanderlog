import { useEffect, useState } from 'react'
import { emitirUso } from '@/lib/usage'

// beforeinstallprompt no está en los tipos del DOM (API solo de Chromium).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DAYS = 30

// El evento puede dispararse antes de que monte React: se captura a nivel de
// módulo y el hook lo recoge al montar.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    listeners.forEach(fn => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emitirUso('pwa.installed')
    listeners.forEach(fn => fn())
  })
}

// Exportada: otras pantallas adaptan su comportamiento cuando la app corre
// instalada (p. ej. la audioguía evita abrir el navegador embebido de iOS).
export function isStandalonePwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua)
    // iPadOS se presenta como macOS pero tiene pantalla táctil.
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return isIos && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function isDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

// Estado de instalabilidad de la PWA:
// - canInstall: hay prompt nativo disponible (Chrome/Edge/Android).
// - isIos: sin prompt nativo; se instala desde Compartir → Añadir a inicio.
// - installed: ya corre como app instalada (no mostrar nada).
export function usePwaInstall() {
  const [, forceUpdate] = useState(0)
  const [dismissed, setDismissed] = useState(isDismissed)

  useEffect(() => {
    const fn = () => forceUpdate(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') deferredPrompt = null
    forceUpdate(n => n + 1)
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return {
    installed: isStandalonePwa(),
    canInstall: !!deferredPrompt,
    isIos: isIosSafari(),
    dismissed,
    promptInstall,
    dismiss,
  }
}
