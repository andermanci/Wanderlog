import TurndownService from 'turndown'
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

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '_' })

// Convierte el HTML de una sección de Wikivoyage en Markdown limpio: conserva el
// formato (listas, negritas, subtítulos, enlaces) pero quita ruido (enlaces de
// edición, referencias, tablas/infoboxes, imágenes, navegación). Los enlaces
// relativos se vuelven absolutos para que funcionen; las anclas internas se
// dejan como texto. `origin` = host del wiki (es/en) para la atribución de enlaces.
function htmlToMarkdown(html: string, origin: string): string {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  root.querySelectorAll(
    '.mw-editsection, sup.reference, sup.noprint, style, table, figure, img, .thumb, .mw-empty-elt, .noprint, .navbox, .metadata, .ambox, .hatnote, .printfooter, #toc, .toc, .mw-jump-link',
  ).forEach(el => el.remove())

  // El primer encabezado es el título de la sección (ya lo mostramos aparte).
  const firstHeading = root.querySelector('.mw-heading, h1, h2, h3, h4')
  if (firstHeading) (firstHeading.closest('.mw-heading') ?? firstHeading).remove()

  // Enlaces relativos → absolutos; anclas internas (#) → solo texto.
  root.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#')) { a.replaceWith(...Array.from(a.childNodes)); return }
    if (href.startsWith('./')) a.setAttribute('href', `${origin}/wiki/${href.slice(2)}`)
    else if (href.startsWith('/')) a.setAttribute('href', origin + href)
  })

  const md = turndown.turndown(root.innerHTML)
    .replace(/\[\d+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return md.length > 6000 ? md.slice(0, 6000).trimEnd() + '…' : md
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

interface VoyageSection { body: string; url: string }

// Lee las secciones de Wikivoyage para cada sección de la guía. Recorre ES y
// luego EN, RELLENANDO las que falten (la versión española suele ser más pobre),
// y guarda por sección el enlace a su fuente real (es/en) para la atribución.
async function wikivoyageSections(destination: string): Promise<Map<string, VoyageSection>> {
  const out = new Map<string, VoyageSection>()
  for (const base of [WIKIVOYAGE_ES, WIKIVOYAGE_EN]) {
    // Si ya tenemos todas las secciones, no hace falta ir a por el siguiente wiki.
    if (out.size >= SECTION_MAP.length) break
    const title = await resolveTitle(base, destination)
    if (!title) continue
    let list: any
    try {
      list = await getJson(base, { action: 'parse', prop: 'sections', page: title })
    } catch { continue }
    const sections: any[] = list?.parse?.sections ?? []
    if (!sections.length) continue
    const lang = base === WIKIVOYAGE_ES ? 'es' : 'en'
    const origin = `https://${lang}.wikivoyage.org`
    const pageUrl = `${origin}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

    for (const target of SECTION_MAP) {
      if (out.has(target.id)) continue // ya rellena (p. ej. desde ES)
      const matches = sections.filter(s => target.headings.some(h => norm(String(s.line ?? '')).includes(h)))
      if (!matches.length) continue
      const parts: string[] = []
      for (const m of matches) {
        try {
          const sec = await getJson(base, { action: 'parse', prop: 'text', section: String(m.index), page: title })
          const txt = htmlToMarkdown(sec?.parse?.text?.['*'] ?? '', origin)
          if (txt) parts.push(txt)
        } catch { /* ignora secciones sueltas */ }
      }
      const body = parts.join('\n\n').trim()
      if (body) out.set(target.id, { body, url: pageUrl })
    }
  }
  return out
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
    const found = voyage.get(target.id)
    sections.push({
      id: target.id,
      title: target.title,
      body: found?.body ?? '',
      source: found ? 'Wikivoyage' : 'manual',
      url: found?.url,
      edited: false,
    })
  }

  return sections
}
