import { describe, it, expect } from 'vitest'
import { normalizarRuta, seccionDe } from './sections'
import { parseEvento, esBot, dispositivoDe, hostDe, MAX_MS, MAX_CUERPO } from './track'
import { geoDeContexto, geoDeCabeceras } from './geo'
import { resumirVistas, mediana, type VistaCruda } from './aggregate'

const UA_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'

describe('normalizarRuta', () => {
  it('QUITA LA QUERY — es lo que impide guardar el token de una invitación', () => {
    expect(normalizarRuta('/dashboard?utm_source=whatsapp')).toBe('/dashboard')
    expect(normalizarRuta('/trips/x?t=secreto')).toBe('/trips/x')
  })

  it('quita el hash ANTES que la query: un hash puede llevar una query dentro', () => {
    expect(normalizarRuta('/dashboard#seccion?t=secreto')).toBe('/dashboard')
  })

  it('colapsa uuid, números y cadenas largas a :id', () => {
    expect(normalizarRuta('/trips/a1c9d000-0000-4a00-b000-000000000a7a/itinerary'))
      .toBe('/trips/:id/itinerary')
    expect(normalizarRuta('/trips/12345')).toBe('/trips/:id')
    // Token de invitación: 32 hex sin guiones, no casa el patrón uuid pero
    // mide más de 24 caracteres. Este es el caso que de verdad importa.
    expect(normalizarRuta('/invite/9f8c2b1a4d5e6f7a8b9c0d1e2f3a4b5c')).toBe('/invite/:id')
  })

  it('rechaza lo que no es una ruta de este sitio', () => {
    expect(normalizarRuta('https://otro.example/x')).toBeNull()
    expect(normalizarRuta('//evil.example')).toBeNull()
    // Un segmento larguísimo NO se rechaza: se colapsa a :id y queda corto,
    // que es justo lo que hay que hacer con un token. Lo que sí se rechaza es
    // una ruta con demasiados segmentos, que ya no es una pantalla de nadie.
    expect(normalizarRuta('/' + 'a'.repeat(200))).toBe('/:id')
    expect(normalizarRuta('/' + Array.from({ length: 40 }, (_, i) => `s${i}`).join('/'))).toBeNull()
    expect(normalizarRuta(42)).toBeNull()
    expect(normalizarRuta(null)).toBeNull()
  })
})

describe('seccionDe', () => {
  it('mapea las pantallas de Wanderlog', () => {
    expect(seccionDe('/dashboard')).toBe('dashboard')
    expect(seccionDe('/')).toBe('dashboard')
    expect(seccionDe('/login')).toBe('acceso')
    expect(seccionDe('/auth/callback')).toBe('acceso')
    expect(seccionDe('/invite/:id')).toBe('invitacion')
    expect(seccionDe('/calendar')).toBe('calendario')
    expect(seccionDe('/settings')).toBe('ajustes')
    expect(seccionDe('/admin/usuarios')).toBe('admin')
  })

  it('separa las secciones del viaje', () => {
    expect(seccionDe('/trips/:id')).toBe('viaje')
    expect(seccionDe('/trips/:id/itinerary')).toBe('itinerario')
    expect(seccionDe('/trips/:id/itinerary/:id')).toBe('itinerario')
    expect(seccionDe('/trips/:id/map')).toBe('mapa')
    expect(seccionDe('/trips/:id/expenses')).toBe('gastos')
  })

  it('la audioguía cuenta aparte: es la función que cuesta dinero', () => {
    expect(seccionDe('/trips/:id/itinerary/:id/audioguide')).toBe('audioguia')
  })

  it('una sección desconocida del viaje no rompe nada', () => {
    expect(seccionDe('/trips/:id/inventada')).toBe('viaje')
    expect(seccionDe('/loquesea')).toBe('otras')
  })
})

describe('esBot', () => {
  it('SIN USER-AGENT ES BOT: un navegador siempre lo manda', () => {
    expect(esBot(null)).toBe(true)
    expect(esBot('')).toBe(true)
  })

  it('caza a los que se identifican, incluidos los previsualizadores de enlaces', () => {
    for (const ua of ['Googlebot/2.1', 'curl/8.4', 'python-requests/2.31',
                      'WhatsApp/2.23 preview', 'HeadlessChrome/120', 'Lighthouse']) {
      expect(esBot(ua), ua).toBe(true)
    }
  })

  it('deja pasar a los navegadores de verdad', () => {
    expect(esBot(UA_CHROME)).toBe(false)
    expect(esBot(UA_IPHONE)).toBe(false)
  })
})

describe('dispositivoDe', () => {
  it('la PWA instalada se mira PRIMERO: su user-agent es idéntico al del navegador', () => {
    expect(dispositivoDe(UA_IPHONE, true)).toBe('pwa')
    expect(dispositivoDe(UA_CHROME, true)).toBe('pwa')
    // Sin la bandera, el mismo user-agent es un móvil normal.
    expect(dispositivoDe(UA_IPHONE, false)).toBe('movil')
  })

  it('distingue móvil, tablet y escritorio', () => {
    expect(dispositivoDe(UA_IPHONE)).toBe('movil')
    expect(dispositivoDe('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1')).toBe('tablet')
    expect(dispositivoDe(UA_CHROME)).toBe('escritorio')
    expect(dispositivoDe(null)).toBe('desconocido')
  })
})

describe('hostDe', () => {
  it('devuelve solo el host, nunca la URL entera', () => {
    expect(hostDe('https://www.google.com/search?q=secreto')).toBe('www.google.com')
    expect(hostDe('no-es-una-url')).toBeNull()
    expect(hostDe(null)).toBeNull()
  })
})

describe('parseEvento', () => {
  const ctx = { userAgent: UA_CHROME, propioHost: 'wanderlog.app' }
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    sid: '22222222-2222-4222-8222-222222222222',
    path: '/trips/a1c9d000-0000-4a00-b000-000000000a7a/itinerary?x=1',
  }
  const parse = (o: object) => parseEvento(JSON.stringify(o), ctx)

  it('EL TOKEN SALE FUERA DEL EVENTO — la función que escribe no puede verlo', () => {
    const r = parse({ ...base, t: 'ey.jwt.falso' })
    expect(r?.token).toBe('ey.jwt.falso')
    // Ni la propiedad ni el valor aparecen por ningún lado del evento.
    expect(JSON.stringify(r?.evento)).not.toContain('jwt')
    expect('t' in (r?.evento ?? {})).toBe(false)
  })

  it('normaliza la ruta otra vez en el servidor, aunque el cliente ya lo hiciera', () => {
    expect(parse(base)?.evento.path).toBe('/trips/:id/itinerary')
    expect(parse(base)?.evento.section).toBe('itinerario')
  })

  it('descarta lo que no encaja en vez de arreglarlo', () => {
    expect(parse({ ...base, id: 'no-es-uuid' })).toBeNull()
    expect(parse({ ...base, sid: '123' })).toBeNull()
    expect(parse({ ...base, path: 'https://evil.example' })).toBeNull()
    expect(parse({ ...base, ms: -5 })).toBeNull()
    expect(parse({ ...base, ms: 'mucho' })).toBeNull()
    expect(parseEvento('esto no es json', ctx)).toBeNull()
    expect(parseEvento('[]', ctx)).toBeNull()
    expect(parseEvento('x'.repeat(MAX_CUERPO + 1), ctx)).toBeNull()
  })

  it('nunca hace spread del objeto entrante: los campos de sobra se ignoran', () => {
    const r = parse({ ...base, user_id: 'de-otro', country: 'XX', is_admin: true })
    expect(r?.evento).not.toHaveProperty('user_id')
    expect(r?.evento).not.toHaveProperty('country')
    expect(r?.evento).not.toHaveProperty('is_admin')
  })

  it('recorta la duración en vez de descartarla: la vista ocurrió', () => {
    expect(parse({ ...base, ms: 999_999_999 })?.evento.ms).toBe(MAX_MS)
    expect(parse({ ...base, ms: 1234 })?.evento.ms).toBe(1234)
    expect(parse(base)?.evento.ms).toBeNull()
  })

  it('descarta el referer propio: navegar por la app no es una procedencia', () => {
    expect(parse({ ...base, ref: 'https://wanderlog.app/dashboard' })?.evento.referrerHost).toBeNull()
    expect(parse({ ...base, ref: 'https://www.google.com/' })?.evento.referrerHost).toBe('www.google.com')
  })

  it('marca el cierre solo con fin === true', () => {
    expect(parse(base)?.evento.cierre).toBe(false)
    expect(parse({ ...base, fin: 'si' })?.evento.cierre).toBe(false)
    expect(parse({ ...base, fin: true })?.evento.cierre).toBe(true)
  })
})

describe('geo', () => {
  it('NO DEVUELVE CIUDAD NI COORDENADAS aunque Netlify las mande todas juntas', () => {
    const g = geoDeContexto({
      country: { code: 'es', name: 'Spain' },
      subdivision: { code: 'BI', name: 'Bizkaia' },
      city: 'Getxo',
      latitude: 43.35,
      longitude: -3.01,
      postalCode: '48930',
    })
    expect(g).toEqual({ country: 'ES', region: 'Bizkaia' })
    expect(Object.keys(g)).toEqual(['country', 'region'])
  })

  it('prefiere el nombre de la región al código: lo lee una persona', () => {
    expect(geoDeContexto({ subdivision: { code: 'BI', name: 'Bizkaia' } }).region).toBe('Bizkaia')
    expect(geoDeContexto({ subdivision: { code: 'BI' } }).region).toBe('BI')
  })

  it('que falte la geolocalización no es un fallo', () => {
    expect(geoDeContexto(null)).toEqual({ country: null, region: null })
    expect(geoDeContexto({})).toEqual({ country: null, region: null })
    expect(geoDeContexto({ country: { code: 'no-iso' } }).country).toBeNull()
  })

  it('lee x-nf-geo (JSON en base64) y también se queda solo con dos campos', () => {
    const payload = { country: { code: 'FR' }, subdivision: { name: 'Occitanie' }, city: 'Toulouse' }
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    const h = (n: string) => (n === 'x-nf-geo' ? b64 : null)
    expect(geoDeCabeceras(h)).toEqual({ country: 'FR', region: 'Occitanie' })
  })

  it('decodifica UTF-8: «Castilla y León» no puede salir roto', () => {
    const payload = { country: { code: 'ES' }, subdivision: { name: 'Castilla y León' } }
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    expect(geoDeCabeceras(n => (n === 'x-nf-geo' ? b64 : null)).region).toBe('Castilla y León')
  })

  it('con base64 roto se queda con las cabecera sueltas, no revienta', () => {
    const h = (n: string) => (n === 'x-nf-geo' ? '%%%no-base64%%%' : n === 'x-nf-country' ? 'PT' : null)
    expect(geoDeCabeceras(h)).toEqual({ country: 'PT', region: null })
  })
})

describe('mediana', () => {
  it('con lista vacía devuelve null, que NO es 0', () => {
    expect(mediana([])).toBeNull()
    expect(mediana([0])).toBe(0)
  })
  it('impares y pares', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 2, 3, 4])).toBe(3)   // (2+3)/2 redondeado
  })
})

describe('resumirVistas', () => {
  const v = (p: Partial<VistaCruda>): VistaCruda => ({
    sessionId: 's1', path: '/dashboard', section: 'dashboard',
    referrerHost: null, utmSource: null, device: 'escritorio',
    country: 'ES', region: 'Bizkaia', ms: null,
    at: '2026-08-10T10:00:00.000Z', userId: null, ...p,
  })

  it('SESIONES NO SON VISTAS: cinco pantallas de la misma persona son una sesión', () => {
    const r = resumirVistas([
      v({ sessionId: 'a' }), v({ sessionId: 'a' }), v({ sessionId: 'a' }),
      v({ sessionId: 'b' }),
    ])
    expect(r.vistas).toBe(4)
    expect(r.sesiones).toBe(2)
    expect(r.vistasPorSesion).toBe(2)
    expect(r.unaSolaVista).toBe(1)
  })

  it('cuenta el embudo de identificadas frente a anónimas', () => {
    const r = resumirVistas([
      v({ sessionId: 'a', userId: 'u1' }),
      v({ sessionId: 'b' }),
      v({ sessionId: 'c' }),
    ])
    expect(r.identificadas).toEqual({ conSesion: 1, anonimas: 2 })
  })

  it('da mediana Y media: la media al lado revela la cola larga', () => {
    const r = resumirVistas([
      v({ ms: 1000 }), v({ ms: 2000 }), v({ ms: 3000 }), v({ ms: 600_000 }),
    ])
    expect(r.conDuracion).toBe(4)
    expect(r.medianaMs).toBe(2500)
    expect(r.mediaMs).toBe(151_500)
  })

  it('sin ninguna duración conocida, mediana null y conDuracion 0', () => {
    const r = resumirVistas([v({}), v({})])
    expect(r.conDuracion).toBe(0)
    expect(r.medianaMs).toBeNull()
    expect(r.mediaMs).toBeNull()
  })

  it('EL DÍA ES EL DE MADRID, NO EL DE UTC: 23:30 UTC ya es el día siguiente', () => {
    // En agosto Madrid es UTC+2, así que las 23:30 UTC del día 10 son las
    // 01:30 del día 11.
    const r = resumirVistas([v({ at: '2026-08-10T23:30:00.000Z' })])
    expect(r.porDia[0].dia).toBe('2026-08-11')
    expect(r.porDia[0].horas[1]).toBe(1)
  })

  it('las horas van anidadas dentro de su día', () => {
    const r = resumirVistas([
      v({ at: '2026-08-10T08:00:00.000Z' }),   // 10:00 en Madrid
      v({ at: '2026-08-10T08:30:00.000Z', sessionId: 'b' }),
    ])
    expect(r.porDia).toHaveLength(1)
    expect(r.porDia[0].horas[10]).toBe(2)
    expect(r.porDia[0].sesiones).toBe(2)
  })

  it('horaMedia divide entre los días CON datos, no entre la ventana pedida', () => {
    // Dos vistas a la misma hora, en dos días distintos, ventana de 90.
    const r = resumirVistas([
      v({ at: '2026-08-10T08:00:00.000Z' }),
      v({ at: '2026-08-11T08:00:00.000Z' }),
    ], { dias: 90 })
    expect(r.horaMedia[10]).toBe(1)   // no 2/90
  })

  it('el sobrante del top se llama «resto» y NO «otras», que ya existe', () => {
    const filas = Array.from({ length: 5 }, (_, i) =>
      v({ sessionId: `s${i}`, section: `sec${i}` }))
    filas.push(v({ sessionId: 'x', section: 'otras' }))
    const r = resumirVistas(filas, { topN: 2 })
    const claves = r.secciones.map(s => s.clave)
    expect(claves).toContain('resto')
    // Si colisionaran, habría dos filas con la misma clave y React lo notaría.
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('los porcentajes siguen cuadrando: el resto no se tira', () => {
    const filas = Array.from({ length: 10 }, (_, i) =>
      v({ sessionId: `s${i}`, section: `sec${i}` }))
    const r = resumirVistas(filas, { topN: 3 })
    expect(r.secciones.reduce((s, x) => s + x.vistas, 0)).toBe(10)
  })

  it('el UTM manda sobre el referer, y sin ninguno es «directo»', () => {
    const r = resumirVistas([
      v({ sessionId: 'a', utmSource: 'newsletter', referrerHost: 'google.com' }),
      v({ sessionId: 'b', referrerHost: 'google.com' }),
      v({ sessionId: 'c' }),
    ])
    const claves = r.procedencia.map(p => p.clave)
    expect(claves).toContain('newsletter')
    expect(claves).toContain('google.com')
    expect(claves).toContain('directo')
  })

  it('sin filas no revienta y no inventa ceros donde debe haber null', () => {
    const r = resumirVistas([])
    expect(r.vistas).toBe(0)
    expect(r.sesiones).toBe(0)
    expect(r.vistasPorSesion).toBe(0)
    expect(r.medianaMs).toBeNull()
    expect(r.ultimaVista).toBeNull()
    expect(r.porDia).toEqual([])
  })

  it('ultimaVista es la más reciente: es la alarma de «ha dejado de grabar»', () => {
    const r = resumirVistas([
      v({ at: '2026-08-01T10:00:00.000Z' }),
      v({ at: '2026-08-09T10:00:00.000Z' }),
      v({ at: '2026-08-05T10:00:00.000Z' }),
    ])
    expect(r.ultimaVista).toBe('2026-08-09T10:00:00.000Z')
  })

  it('arrastra el flag de truncado para que el panel pueda avisarlo', () => {
    expect(resumirVistas([], { truncado: true }).truncado).toBe(true)
  })
})
