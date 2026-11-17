/**
 * Color real (no la variable) de un tono, para lo que no entiende CSS: pines de
 * Google Maps, Recharts. Se resuelve contra el tema activo en el momento de llamar.
 */
export function toneColor(tone: string): string {
  const probe = document.createElement('span')
  probe.dataset.tone = tone
  probe.style.color = 'var(--tone)'
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}
