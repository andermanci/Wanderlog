import type { DiffTotals } from '@/lib/versions/diff'

// "3 actividades cambian de día, 2 de hora y 1 es nueva." Para resúmenes y confirmaciones.
export function changesSentence(t: DiffTotals): string {
  const parts: string[] = []
  if (t.moved) parts.push(`${t.moved} ${t.moved === 1 ? 'actividad cambia' : 'actividades cambian'} de día`)
  if (t.time) {
    // Detrás de "cambian de día" basta con "2 de hora".
    const verb = parts.length ? '' : t.time === 1 ? ' actividad cambia' : ' actividades cambian'
    parts.push(`${t.time}${verb} de hora`)
  }
  if (t.added) parts.push(`${t.added} ${t.added === 1 ? 'es nueva' : 'son nuevas'}`)
  if (t.removed) parts.push(`${t.removed} ${t.removed === 1 ? 'se quita' : 'se quitan'}`)
  if (t.placed) parts.push(`${t.placed} ${t.placed === 1 ? 'cambia de sitio en el mapa' : 'cambian de sitio en el mapa'}`)
  if (t.transit) parts.push(`${t.transit} ${t.transit === 1 ? 'trayecto tiene ruta nueva o distinta' : 'trayectos tienen ruta nueva o distinta'}`)
  if (!parts.length) return t.daysChanged ? 'Solo cambia el orden de algunas visitas.' : 'No hay cambios.'
  const last = parts.pop()!
  const s = parts.length ? `${parts.join(', ')} y ${last}` : last
  return `${s[0].toUpperCase()}${s.slice(1)}.`
}
