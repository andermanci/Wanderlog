// De una ruta a una clave que se pueda contar.
//
// Puro y SIN DEPENDENCIAS, ni siquiera el alias `@/`: este módulo lo importa
// también la edge function de Netlify, que corre en Deno y resuelve por ruta
// relativa. Nada de `import.meta.env`, nada de Buffer, nada de supabase.
//
// LO MÁS IMPORTANTE QUE HACE ES QUITAR LA QUERY, y colapsar los identificadores.
// `/invite/<token>` lleva un token de invitación de 32 caracteres que da acceso
// a un viaje ajeno: guardar la ruta cruda lo metería en la tabla de analítica.
// Se quita en el cliente (que manda `location.pathname`) y OTRA VEZ aquí,
// porque el endpoint es público y puede llegar cualquier cosa.

/** Tope de longitud. Una ruta legítima de Wanderlog no se acerca. */
const MAX_LARGO = 120

/**
 * Segmentos que son datos y no pantallas: uuid de viaje, de actividad, tokens
 * de invitación. Sin colapsarlos, «las secciones más vistas» sería una lista
 * de identificadores y no se podría leer nada.
 */
const ES_VARIABLE = (seg: string) =>
  /^\d+$/.test(seg) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ||
  seg.length > 24

/**
 * Normaliza una ruta para que sirva de clave.
 * `null` si no parece una ruta de este sitio.
 */
export function normalizarRuta(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const limpio = raw.trim()
  if (!limpio.startsWith('/') || limpio.startsWith('//')) return null

  // Hash primero y query después, en este orden: un hash puede llevar dentro
  // una query, y al revés se colaría.
  const sinHash = limpio.split('#')[0]
  const sinQuery = sinHash.split('?')[0]

  const partes = sinQuery
    .split('/')
    .filter(Boolean)
    .map(seg => (ES_VARIABLE(seg) ? ':id' : seg.toLowerCase()))

  const path = '/' + partes.join('/')
  if (path.length > MAX_LARGO) return null
  // Último filtro por fuerza bruta: si tras normalizar aún queda algo raro, fuera.
  return /^[a-z0-9\-_/.:]*$/.test(path.slice(1)) ? path : null
}

// Las secciones de un viaje, con el nombre que se lee en el panel. La clave es
// el segmento de la ruta; el valor es lo que se guarda en la columna `section`.
const SECCION_VIAJE: Record<string, string> = {
  itinerary: 'itinerario',
  map: 'mapa',
  places: 'lugares',
  documents: 'documentos',
  reminders: 'avisos',
  packing: 'equipaje',
  expenses: 'gastos',
  guide: 'guia',
  memory: 'recuerdo',
  settings: 'ajustes-viaje',
}

/**
 * A qué parte del producto pertenece una ruta ya normalizada.
 *
 * Se calcula EN EL SERVIDOR, no en el cliente: cambiar este mapa no puede
 * depender de que caduquen los bundles que ya se sirvieron.
 */
export function seccionDe(path: string): string {
  if (path === '/' || path === '/dashboard') return 'dashboard'
  if (path.startsWith('/login') || path.startsWith('/auth')) return 'acceso'
  if (path.startsWith('/invite')) return 'invitacion'
  if (path.startsWith('/calendar')) return 'calendario'
  if (path.startsWith('/settings')) return 'ajustes'
  if (path.startsWith('/import')) return 'importar'
  if (path.startsWith('/admin')) return 'admin'

  if (path.startsWith('/trips/')) {
    const seg = path.split('/')   // ['', 'trips', ':id', <seccion>, ...]
    // La audioguía cuelga del detalle de una actividad
    // (/trips/:id/itinerary/:id/audioguide) y merece contarse aparte: es la
    // función que cuesta dinero.
    if (seg[5] === 'audioguide') return 'audioguia'
    if (!seg[3]) return 'viaje'
    return SECCION_VIAJE[seg[3]] ?? 'viaje'
  }

  return 'otras'
}
