// Conversión de "hora de pared + zona IANA" a un instante UTC.
//
// Hace falta porque activities.start_time/end_time son `time` de Postgres: horas
// de pared, sin fecha y sin zona. El usuario teclea lo que pone el billete (la
// salida en hora local del origen, la llegada en hora local del destino), así
// que los datos son correctos — lo que faltaba era saber en qué huso está
// escrita cada una para poder restarlas de verdad.
//
// Sin dependencias: es exactamente el algoritmo que lleva dentro date-fns-tz, y
// aquí no hacemos aritmética de fechas en zona (todas las fechas son strings
// yyyy-MM-dd de Postgres).
//
// INVARIANTE: ni un solo `new Date(y, m, d)` ni `getTimezoneOffset()`. Ambos
// dependen de la zona de la máquina y harían que el resultado (y los tests)
// cambiasen según dónde se ejecuten.

/** Marco temporal: la zona IANA, o null si no se conoce. */
export type Zone = string | null

// Construir un DateTimeFormat cuesta ~30 µs y el motor de conflictos llama a
// esto en cada render. Son inmutables: se cachean por zona.
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Offset de `tz` en el instante `utcMs`, en minutos (al este de Greenwich, positivo). */
export function tzOffsetMinutes(tz: string, utcMs: number): number {
  const parts = fmt(tz).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asIfUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'),
  )
  // asIfUtc no lleva milisegundos: hay que truncar utcMs al segundo para restar.
  return (asIfUtc - Math.floor(utcMs / 1000) * 1000) / 60_000
}

/**
 * Hora de pared + zona → instante UTC en ms.
 * `wallToUtcMs('2026-03-12', '12:00', 'Europe/Madrid')`
 *
 * Con `zone` null (o 'UTC') devuelve un pseudo-instante: la hora de pared
 * tratada como si fuera UTC. Restar dos pseudo-instantes de la MISMA ciudad da
 * el resultado correcto, así que un viaje de una sola zona (el caso normal)
 * funciona igual con husos que sin ellos — y se ahorra el coste de Intl.
 */
export function wallToUtcMs(date: string, time: string, zone: Zone): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm)

  // Camino rápido: sin zona conocida no hay nada que corregir.
  if (zone == null || zone === 'UTC') return naive

  const off1 = tzOffsetMinutes(zone, naive)
  const guess = naive - off1 * 60_000
  // Segunda pasada: cerca de un cambio de hora, el offset del instante estimado
  // puede no ser el que se usó para estimarlo.
  const off2 = tzOffsetMinutes(zone, guess)
  return off2 === off1 ? guess : naive - off2 * 60_000
}

/**
 * ¿Se pueden comparar dos marcos? Solo si ambos son conocidos, o ambos
 * desconocidos (misma ciudad, horas de pared comparables entre sí).
 *
 * Mezclar uno conocido con uno desconocido daría un resultado inventado, así
 * que ahí el motor de conflictos calla: es mejor no avisar que mentir.
 */
export function comparableZones(a: Zone, b: Zone): boolean {
  return (a == null) === (b == null)
}

/** "13 h 30 min", "45 min". Vacío si no es un número de minutos razonable. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}
