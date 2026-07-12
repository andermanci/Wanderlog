import type { AudioguideAiProvider } from './aiProviders'
import type { AudioguideDetailLevel } from './buildPrompt'

// Borrador del flujo de audioguía en localStorage. iOS mata la PWA si pasas
// un rato en la app de la IA; al relanzarse desde cero (dashboard) esto
// permite volver al punto exacto donde estabas, con lo pegado incluido.
export interface AudioguideDraft {
  tripId: string
  activityId: string
  activityTitle: string
  provider: AudioguideAiProvider
  detailLevel: AudioguideDetailLevel
  pastedText: string
  updatedAt: number
}

const KEY = 'wanderlog-audioguide-draft'
const MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 h: más viejo ya no es "a medias"

export function saveAudioguideDraft(draft: Omit<AudioguideDraft, 'updatedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }))
  } catch { /* almacenamiento lleno o bloqueado: el flujo sigue sin borrador */ }
}

export function loadAudioguideDraft(): AudioguideDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as AudioguideDraft
    if (!draft.tripId || !draft.activityId || Date.now() - draft.updatedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearAudioguideDraft() {
  try { localStorage.removeItem(KEY) } catch { /* sin consecuencias */ }
}
