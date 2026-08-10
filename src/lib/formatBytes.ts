// Tamaños en la escala que usa el sistema operativo (base 1000, MB y no MiB):
// el panel se compara con lo que dice el panel de Supabase, y ahí es base 1000.
const UNIDADES = ['B', 'kB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const i = Math.min(Math.floor(Math.log10(n) / 3), UNIDADES.length - 1)
  const valor = n / 1000 ** i
  // Un decimal a partir de MB; por debajo, los decimales son ruido.
  return `${valor.toFixed(i >= 2 && valor < 100 ? 1 : 0)} ${UNIDADES[i]}`
}
