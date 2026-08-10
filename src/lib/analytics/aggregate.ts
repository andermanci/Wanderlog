// De filas sueltas a las cifras que se miran.
//
// Va en una función PURA y no en SQL para poder probarla con vitest en 200 ms
// sin base de datos. Y lo que se prueba no es aritmética de adorno: es que
// «sesiones» no cuente cinco veces a quien navega por cinco pantallas, que una
// pestaña olvidada no se lleve por delante la media, y que el día natural sea
// el de Madrid y no el de UTC.
//
// CUÁNDO DEJARÁ DE VALER: por encima de unas 20.000 filas en la ventana
// conviene pasar a un acumulado diario en Postgres. Hasta entonces, hacerlo en
// SQL sería complicar lo que hoy tarda milisegundos.

export interface VistaCruda {
  sessionId: string
  path: string
  section: string
  referrerHost: string | null
  utmSource: string | null
  device: string
  country: string | null
  region: string | null
  ms: number | null
  at: string
  userId: string | null
}

export interface Conteo {
  clave: string
  sesiones: number
  vistas: number
}

export interface Resumen {
  dias: number
  vistas: number
  /**
   * SESIONES, no usuarios: el identificador vive en sessionStorage y muere al
   * cerrar la pestaña, así que la misma persona que vuelve mañana cuenta dos
   * veces. Llamarlo «usuarios» contaminaría todas las decisiones que se tomen
   * mirando esto.
   */
  sesiones: number
  vistasPorSesion: number
  /** De cuántas vistas se conoce la duración. Sin esto la mediana no se puede
   *  interpretar: puede estar calculada sobre el 10 % de los datos. */
  conDuracion: number
  medianaMs: number | null
  mediaMs: number | null
  /** Sesiones de UNA sola vista. No significa «no le interesó». */
  unaSolaVista: number
  /** Con sesión iniciada frente a anónimas: es el embudo. */
  identificadas: { conSesion: number; anonimas: number }
  /**
   * Un punto por día y, dentro, las 24 horas de ESE día. Va anidado y no en
   * una lista aparte porque la pregunta que contesta es «¿a qué hora pasó lo
   * del martes?», no «¿a qué hora en general?»: el modal se abre desde un día.
   */
  porDia: { dia: string; vistas: number; sesiones: number; horas: number[] }[]
  secciones: (Conteo & { medianaMs: number | null })[]
  procedencia: Conteo[]
  dispositivos: Conteo[]
  paises: Conteo[]
  regiones: Conteo[]
  /** Media de vistas por hora en toda la ventana. Es la referencia del modal:
   *  un día suelto no dice nada sin saber cómo es un día normal. */
  horaMedia: number[]
  /** La lectura topó con el límite: las cifras están cortas. */
  truncado: boolean
  /** Cuándo fue la última vista. Es la alarma de «esto ha dejado de grabar». */
  ultimaVista: string | null
}

/**
 * El día natural EN ESPAÑA, no en UTC. Quien mira esto está en Madrid y para
 * esa persona una visita a las 00:30 es de hoy, no de ayer. `sv-SE` da
 * `YYYY-MM-DD` sin necesidad de librería.
 */
const DIA = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })
const diaDe = (iso: string) => DIA.format(new Date(iso))

/** La hora, en la misma zona que el día: si no, un día empezaría a las 22:00. */
const HORA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  hour12: false,
})
const horaDe = (iso: string) => Number(HORA.format(new Date(iso))) % 24

/** Mediana. Con lista vacía devuelve `null`, que NO es lo mismo que 0. */
export function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

/** Agrupa contando sesiones DISTINTAS, no filas. */
function agrupar(
  filas: VistaCruda[],
  clave: (v: VistaCruda) => string | null,
  topN: number,
): Conteo[] {
  const sesiones = new Map<string, Set<string>>()
  const vistas = new Map<string, number>()
  for (const v of filas) {
    const k = clave(v)
    if (!k) continue
    if (!sesiones.has(k)) sesiones.set(k, new Set())
    sesiones.get(k)!.add(v.sessionId)
    vistas.set(k, (vistas.get(k) ?? 0) + 1)
  }
  const todo = [...sesiones.entries()]
    .map(([clave, set]) => ({ clave, sesiones: set.size, vistas: vistas.get(clave) ?? 0 }))
    .sort((a, b) => b.sesiones - a.sesiones || b.vistas - a.vistas)

  if (todo.length <= topN) return todo

  // El sobrante NO se tira en silencio: se agrupa, para que los porcentajes
  // sigan sumando lo que tienen que sumar.
  //
  // Se llama «resto» y NO «otras»: `seccionDe` ya devuelve «otras» para las
  // rutas que no encajan en ninguna sección, así que las dos colisionarían y
  // la tabla saldría con dos filas «otras» —una con las rutas sin clasificar y
  // otra con lo que no cupo en el top, que son cosas distintas—, además de
  // romper las claves de React.
  const sobra = todo.slice(topN)
  return [
    ...todo.slice(0, topN),
    {
      clave: 'resto',
      sesiones: sobra.reduce((s, x) => s + x.sesiones, 0),
      vistas: sobra.reduce((s, x) => s + x.vistas, 0),
    },
  ]
}

export function resumirVistas(
  filas: VistaCruda[],
  opts: { dias?: number; topN?: number; truncado?: boolean } = {},
): Resumen {
  const { dias = 30, topN = 8, truncado = false } = opts

  const sesiones = new Set(filas.map(v => v.sessionId))
  const conDuracion = filas.filter(v => v.ms != null)
  const duraciones = conDuracion.map(v => v.ms as number)

  const porSesion = new Map<string, number>()
  const identificadas = new Set<string>()
  for (const v of filas) {
    porSesion.set(v.sessionId, (porSesion.get(v.sessionId) ?? 0) + 1)
    if (v.userId) identificadas.add(v.sessionId)
  }

  const dias_ = new Map<string, { vistas: number; sesiones: Set<string>; horas: number[] }>()
  const horaTotal = Array<number>(24).fill(0)
  let ultima: string | null = null
  for (const v of filas) {
    const d = diaDe(v.at)
    if (!dias_.has(d)) {
      dias_.set(d, { vistas: 0, sesiones: new Set(), horas: Array<number>(24).fill(0) })
    }
    const e = dias_.get(d)!
    e.vistas += 1
    e.sesiones.add(v.sessionId)
    const h = horaDe(v.at)
    e.horas[h] += 1
    horaTotal[h] += 1
    if (!ultima || v.at > ultima) ultima = v.at
  }

  const porSeccion = agrupar(filas, v => v.section, topN).map(c => ({
    ...c,
    medianaMs: mediana(
      filas.filter(v => v.section === c.clave && v.ms != null).map(v => v.ms as number),
    ),
  }))

  return {
    dias,
    vistas: filas.length,
    sesiones: sesiones.size,
    vistasPorSesion: sesiones.size
      ? Math.round((filas.length / sesiones.size) * 10) / 10
      : 0,
    conDuracion: conDuracion.length,
    // Las dos: la mediana es la que se lee, y la media al lado enseña cuándo
    // hay una cola larga que la mediana esconde.
    medianaMs: mediana(duraciones),
    mediaMs: duraciones.length
      ? Math.round(duraciones.reduce((s, x) => s + x, 0) / duraciones.length)
      : null,
    unaSolaVista: [...porSesion.values()].filter(n => n === 1).length,
    identificadas: {
      conSesion: identificadas.size,
      anonimas: sesiones.size - identificadas.size,
    },
    porDia: [...dias_.entries()]
      .map(([dia, e]) => ({ dia, vistas: e.vistas, sesiones: e.sesiones.size, horas: e.horas }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    // Se divide entre los días CON datos, no entre `dias`: con una ventana de
    // 90 días y una semana de historia, dividir entre 90 aplanaría la media
    // hasta hacerla inútil justo cuando más falta hace la referencia.
    horaMedia: horaTotal.map(n => (dias_.size ? Math.round((n / dias_.size) * 10) / 10 : 0)),
    secciones: porSeccion,
    // El UTM manda sobre el referer: si has etiquetado la campaña es que
    // quieres esa etiqueta. «directo» incluye los enlaces abiertos desde
    // WhatsApp, que es como se comparte de verdad un viaje.
    procedencia: agrupar(filas, v => v.utmSource ?? v.referrerHost ?? 'directo', topN),
    dispositivos: agrupar(filas, v => v.device || 'desconocido', topN),
    paises: agrupar(filas, v => v.country, topN),
    regiones: agrupar(filas, v => v.region, topN),
    truncado,
    ultimaVista: ultima,
  }
}
