import type { AudioguideAiProvider } from './aiProviders'
import type { AudioguideDetailLevel } from './buildPrompt'
import type { AudioguideScope } from './scope'

// Borrador del flujo de audioguía en localStorage. iOS mata la PWA si pasas
// un rato en la app de la IA; al relanzarse desde cero (dashboard) esto
// permite volver al punto exacto donde estabas, con lo pegado incluido.
export interface AudioguideDraft {
  tripId: string
  scope: AudioguideScope
  /** Nombre de lo que se está guiando (la actividad o la ciudad del día). */
  title: string
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

// Forma antigua del borrador (antes de que existieran las audioguías de día).
interface LegacyDraft {
  activityId?: string
  activityTitle?: string
}

export function loadAudioguideDraft(): AudioguideDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AudioguideDraft & LegacyDraft

    // Un borrador guardado por la versión anterior solo sabía de actividades.
    // Se convierte en vez de tirarse: quien tenga la PWA abierta a medias de
    // pegar un guion cuando se despliegue esto no pierde lo que llevaba.
    const draft: AudioguideDraft = parsed.scope
      ? parsed
      : { ...parsed, scope: { kind: 'activity', id: parsed.activityId ?? '' }, title: parsed.activityTitle ?? '' }

    if (!draft.tripId || !draft.scope?.id || Date.now() - draft.updatedAt > MAX_AGE_MS) {
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
