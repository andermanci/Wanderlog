export interface SentenceTiming {
  text: string
  start: number
}

// Corta un guion en frases: divide en el espacio que sigue a . ! ? …
// siempre que después venga un arranque de frase (mayúscula, ¿ ¡ « " o
// paréntesis). El lookbehind negativo protege las abreviaturas habituales
// en las guías ("Sr. García", "s. XVI"); los números tipo "3.500" ya están
// a salvo porque exigimos un espacio tras la puntuación.
// Mantener en sync con supabase/functions/audioguide-tts/index.ts.
const SENTENCE_BREAK =
  /(?<!\b(?:Sr|Sra|Srta|Dr|Dra|D|Dña|S|s|St|Sta|núm|nº|art|pág|aprox|etc)\.)(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡«"(])/

// Fragmentos más cortos que esto se fusionan con la frase anterior para
// que el resaltado no parpadee ("¡Sí!", "Continuemos.").
const MIN_SENTENCE_CHARS = 20

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const parts = normalized.split(SENTENCE_BREAK)
  const sentences: string[] = []
  for (const part of parts) {
    const prev = sentences[sentences.length - 1]
    if (prev !== undefined && (part.length < MIN_SENTENCE_CHARS || prev.length < MIN_SENTENCE_CHARS)) {
      sentences[sentences.length - 1] = `${prev} ${part}`
    } else {
      sentences.push(part)
    }
  }
  return sentences
}

// Timings aproximados para audio generado antes de que la edge function
// devolviera timepoints reales: reparte la duración proporcionalmente a la
// longitud de cada frase, con un peso extra fijo por la pausa entre frases.
const PAUSE_WEIGHT_CHARS = 8

export function estimateTimings(text: string, durationSeconds: number): SentenceTiming[] {
  const sentences = splitSentences(text)
  if (sentences.length === 0 || !isFinite(durationSeconds) || durationSeconds <= 0) {
    return sentences.map((s) => ({ text: s, start: 0 }))
  }

  const weights = sentences.map((s) => s.length + PAUSE_WEIGHT_CHARS)
  const total = weights.reduce((a, b) => a + b, 0)
  let accumulated = 0
  return sentences.map((s, i) => {
    const start = Math.round((durationSeconds * accumulated / total) * 100) / 100
    accumulated += weights[i]
    return { text: s, start }
  })
}

// Índice de la frase sonando en currentTime: la última cuyo start ya ha
// pasado, con un pequeño adelanto para que el resaltado entre justo al
// arrancar la frase. -1 si aún no ha empezado la primera.
const HIGHLIGHT_LEAD_SECONDS = 0.15

export function activeSentenceIndex(timings: SentenceTiming[], currentTime: number): number {
  const t = currentTime + HIGHLIGHT_LEAD_SECONDS
  for (let i = timings.length - 1; i >= 0; i--) {
    if (timings[i].start <= t) return i
  }
  return -1
}
