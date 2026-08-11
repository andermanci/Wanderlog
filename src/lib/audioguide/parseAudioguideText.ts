export interface ParsedAudioguideStop {
  title: string
  summary: string | null
  directionText: string | null
  /** Nombre buscable del sitio, para situar la parada en el mapa. */
  placeQuery: string | null
  /** Coordenadas que da la propia IA; null si la parada no es un sitio. */
  coords: { lat: number; lng: number } | null
  scriptText: string
}

// Parsea el texto pegado desde Claude, con bloques del tipo:
// ###PARADA###
// TITULO: ...
// RESUMEN: ...
// DIRECCION: ...
// LUGAR: ...
// COORDENADAS: ...
// GUION: ...
// ###FIN###
// LUGAR y COORDENADAS son opcionales: las audioguías generadas antes de que
// existieran los campos (y las paradas de interior, que responden NINGUNO) se
// quedan sin ellos.
export function parseAudioguideText(raw: string): ParsedAudioguideStop[] {
  const blocks = raw.split(/###PARADA###/i).slice(1)
  const stops: ParsedAudioguideStop[] = []

  for (const blockRaw of blocks) {
    const block = blockRaw.split(/###FIN###/i)[0]
    const titleMatch = block.match(/TITULO:\s*(.+)/i)
    const summaryMatch = block.match(/RESUMEN:\s*([\s\S]*?)(?=\n\s*DIRECCION:|\n\s*LUGAR:|\n\s*COORDENADAS:|\n\s*GUION:|$)/i)
    const directionMatch = block.match(/DIRECCION:\s*([\s\S]*?)(?=\n\s*LUGAR:|\n\s*COORDENADAS:|\n\s*GUION:|$)/i)
    const placeMatch = block.match(/LUGAR:\s*(.+)/i)
    const coordsMatch = block.match(/COORDENADAS:\s*(.+)/i)
    const scriptMatch = block.match(/GUION:\s*([\s\S]*)/i)

    const title = titleMatch?.[1]?.trim()
    const scriptText = scriptMatch?.[1]?.trim()
    if (!title || !scriptText) continue

    const placeQuery = placeMatch?.[1]?.trim() ?? ''

    stops.push({
      title,
      summary: summaryMatch?.[1]?.trim() || null,
      directionText: directionMatch?.[1]?.trim() || null,
      // "NINGUNO" (con o sin punto/mayúsculas) es la respuesta pactada para las
      // paradas de interior: no son un sitio propio del mapa.
      placeQuery: /^ninguno\.?$/i.test(placeQuery) ? null : placeQuery || null,
      coords: parseCoords(coordsMatch?.[1]),
      scriptText,
    })
  }

  if (stops.length === 0) {
    throw new Error(
      'No se ha podido interpretar ninguna parada. Asegúrate de pegar la respuesta completa ' +
      'de Claude, sin modificarla, respetando el formato ###PARADA### / ###FIN###.',
    )
  }

  return stops
}

// "43.77313, 11.25596" → punto. Acepta el formato con paréntesis o con N/E,
// y descarta cualquier cosa que no sea un par de números plausibles: una
// coordenada inventada a medias es peor que no tener coordenada.
export function parseCoords(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null
  const m = raw.match(/(-?\d{1,3}[.,]\d+)\s*[,;]\s*(-?\d{1,3}[.,]\d+)/)
  if (!m) return null
  const lat = Number(m[1].replace(',', '.'))
  const lng = Number(m[2].replace(',', '.'))
  if (!isFinite(lat) || !isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}
