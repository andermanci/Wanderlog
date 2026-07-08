export type AudioguideAiProvider = 'claude' | 'chatgpt' | 'gemini' | 'perplexity'

export const AUDIOGUIDE_AI_PROVIDERS: { id: AudioguideAiProvider; label: string; url: string }[] = [
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/' },
]
