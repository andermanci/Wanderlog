export interface ParsedAudioguideStop {
  title: string
  summary: string | null
  directionText: string | null
  scriptText: string
}

// Parsea el texto pegado desde Claude, con bloques del tipo:
// ###PARADA###
// TITULO: ...
// RESUMEN: ...
// DIRECCION: ...
// GUION: ...
// ###FIN###
export function parseAudioguideText(raw: string): ParsedAudioguideStop[] {
  const blocks = raw.split(/###PARADA###/i).slice(1)
  const stops: ParsedAudioguideStop[] = []

  for (const blockRaw of blocks) {
    const block = blockRaw.split(/###FIN###/i)[0]
    const titleMatch = block.match(/TITULO:\s*(.+)/i)
    const summaryMatch = block.match(/RESUMEN:\s*([\s\S]*?)(?=\n\s*DIRECCION:|\n\s*GUION:|$)/i)
    const directionMatch = block.match(/DIRECCION:\s*([\s\S]*?)(?=\n\s*GUION:|$)/i)
    const scriptMatch = block.match(/GUION:\s*([\s\S]*)/i)

    const title = titleMatch?.[1]?.trim()
    const scriptText = scriptMatch?.[1]?.trim()
    if (!title || !scriptText) continue

    stops.push({
      title,
      summary: summaryMatch?.[1]?.trim() || null,
      directionText: directionMatch?.[1]?.trim() || null,
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
