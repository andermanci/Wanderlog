import type { GuideSection } from '@/types/database'

// Importa un borrador de "guía del destino" desde APIs públicas de Wikimedia
// (Wikipedia + Wikivoyage), sin clave de API. La Action API admite CORS con
// `origin=*`, así que se llama directamente desde el navegador. El resultado es
// editable por el usuario (ver GuidePage); por eso siempre devolvemos el mismo
// esqueleto de secciones aunque alguna venga vacía.

const WIKIPEDIA_ES = 'https://es.wikipedia.org/w/api.php'
const WIKIVOYAGE_ES = 'https://es.wikivoyage.org/w/api.php'
const WIKIVOYAGE_EN = 'https://en.wikivoyage.org/w/api.php'

// Secciones de Wikivoyage que mapeamos a cada sección de la guía (es + en).
const SECTION_MAP: Array<{ id: string; title: string; headings: string[] }> = [
  { id: 'costumbres', title: 'Costumbres y etiqueta', headings: ['respeta', 'respetar', 'respect'] },
  { id: 'idioma', title: 'Idioma y frases útiles', headings: ['habla', 'hablar', 'talk', 'language', 'idioma'] },
  { id: 'comida', title: 'Comida y bebida', headings: ['come', 'comer', 'eat', 'gastronom', 'bebe', 'beber', 'drink'] },
  { id: 'seguridad', title: 'Seguridad y salud', headings: ['mantente seguro', 'mantente a salvo', 'stay safe', 'seguridad', 'mantente sano', 'stay healthy', 'salud'] },
  { id: 'moverse', title: 'Cómo moverse', headings: ['desplázate', 'desplazate', 'muévete', 'muevete', 'get around', 'desplazarse', 'transporte'] },
]

const DIACRITICS = /[̀-ͯ]/g
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()
}

async function getJson(base: string, params: Record<string, string>): Promise<any> {
  const url = `${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Convierte el HTML de una sección en texto limpio (sin refs, enlaces de edición,
// tablas/infoboxes ni imágenes). Limita la longitud para no cargar en exceso.
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('.mw-editsection, sup.reference, style, table, .thumb, .mw-empty-elt, .noprint').forEach(el => el.remove())
  const text = (doc.body.textContent ?? '')
    .replace(/\[\d+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return text.length > 4000 ? text.slice(0, 4000).trimEnd() + '…' : text
}

async function resolveTitle(base: string, query: string): Promise<string | null> {
  try {
    const data = await getJson(base, { action: 'query', list: 'search', srsearch: query, srlimit: '1' })
    return data?.query?.search?.[0]?.title ?? null
  } catch {
    return null
  }
}

async function wikipediaOverview(destination: string): Promise<GuideSection | null> {
  const title = await resolveTitle(WIKIPEDIA_ES, destination)
  if (!title) return null
  try {
    const data = await getJson(WIKIPEDIA_ES, {
      action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1', titles: title,
    })
    const pages = data?.query?.pages ?? {}
    const page: any = Object.values(pages)[0]
    const extract: string = page?.extract ?? ''
    if (!extract.trim()) return null
    return {
      id: 'resumen',
      title: 'Resumen e historia',
      body: extract.trim(),
      source: 'Wikipedia',
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      edited: false,
    }
  } catch {
    return null
  }
}

// Devuelve un mapa { idSección -> texto } leyendo las secciones de Wikivoyage.
async function wikivoyageSections(destination: string): Promise<{ texts: Map<string, string>; url: string | null }> {
  const texts = new Map<string, string>()
  for (const base of [WIKIVOYAGE_ES, WIKIVOYAGE_EN]) {
    const title = await resolveTitle(base, destination)
    if (!title) continue
    let list: any
    try {
      list = await getJson(base, { action: 'parse', prop: 'sections', page: title })
    } catch { continue }
    const sections: any[] = list?.parse?.sections ?? []
    if (!sections.length) continue
    const lang = base === WIKIVOYAGE_ES ? 'es' : 'en'
    const pageUrl = `https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

    for (const target of SECTION_MAP) {
      const matches = sections.filter(s => target.headings.some(h => norm(String(s.line ?? '')).includes(h)))
      if (!matches.length) continue
      const parts: string[] = []
      for (const m of matches) {
        try {
          const sec = await getJson(base, { action: 'parse', prop: 'text', section: String(m.index), page: title })
          const txt = htmlToText(sec?.parse?.text?.['*'] ?? '')
          if (txt) parts.push(txt)
        } catch { /* ignora secciones sueltas */ }
      }
      const body = parts.join('\n\n').trim()
      if (body && !texts.has(target.id)) texts.set(target.id, body)
    }
    // Si la versión ES dio algo, no hace falta caer a EN.
    if (texts.size) return { texts, url: pageUrl }
    return { texts, url: pageUrl }
  }
  return { texts, url: null }
}

export async function fetchDestinationInfo(destination: string): Promise<GuideSection[]> {
  const [overview, voyage] = await Promise.all([
    wikipediaOverview(destination),
    wikivoyageSections(destination),
  ])

  const sections: GuideSection[] = []
  if (overview) {
    sections.push(overview)
  } else {
    sections.push({ id: 'resumen', title: 'Resumen e historia', body: '', source: 'manual', edited: false })
  }

  for (const target of SECTION_MAP) {
    const body = voyage.texts.get(target.id) ?? ''
    sections.push({
      id: target.id,
      title: target.title,
      body,
      source: body ? 'Wikivoyage' : 'manual',
      url: body ? voyage.url ?? undefined : undefined,
      edited: false,
    })
  }

  return sections
}
