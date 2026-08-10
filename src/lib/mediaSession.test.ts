import { describe, it, expect, vi } from 'vitest'
import {
  ACCIONES_REGISTRADAS, MEDIA_SESSION_ACTIONS, applyPositionState, buildArtwork, buildPositionState,
  clearMediaSession, setActionHandlerSafe, toAbsoluteUrl, type MediaSessionLike,
} from './mediaSession'

/** Doble de la sesión del sistema: opcionalmente lanza, como hace Safari. */
function fakeSession(options: {
  throwsOn?: MediaSessionAction[]
  positionThrows?: boolean
  noPositionState?: boolean
} = {}) {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
  const session: MediaSessionLike = {
    metadata: {} as MediaMetadata,
    playbackState: 'playing',
    setActionHandler(action, handler) {
      if (options.throwsOn?.includes(action)) throw new TypeError('unsupported action')
      handlers.set(action, handler)
    },
    setPositionState: options.noPositionState
      ? undefined
      : vi.fn(() => { if (options.positionThrows) throw new TypeError('bad position') }),
  }
  return { session, handlers }
}

describe('buildPositionState', () => {
  it('NO MANDA NADA CON DURACIONES IMPOSIBLES — con NaN o Infinity Safari lanza un TypeError', () => {
    expect(buildPositionState(NaN, 0, 1)).toBeNull()
    expect(buildPositionState(Infinity, 0, 1)).toBeNull()
    expect(buildPositionState(0, 0, 1)).toBeNull()
    expect(buildPositionState(-5, 0, 1)).toBeNull()
  })

  it('recorta la posición al rango: pasarse de la duración también hace lanzar a Safari', () => {
    expect(buildPositionState(100, 150, 1)?.position).toBe(100)
    expect(buildPositionState(100, -3, 1)?.position).toBe(0)
    expect(buildPositionState(100, NaN, 1)?.position).toBe(0)
  })

  it('normaliza una velocidad inválida a 1×', () => {
    expect(buildPositionState(100, 10, 0)?.playbackRate).toBe(1)
    expect(buildPositionState(100, 10, -1)?.playbackRate).toBe(1)
    expect(buildPositionState(100, 10, NaN)?.playbackRate).toBe(1)
    expect(buildPositionState(100, 10, 1.5)?.playbackRate).toBe(1.5)
  })
})

describe('applyPositionState', () => {
  it('se traga el TypeError de Safari en vez de tumbar el render', () => {
    const { session } = fakeSession({ positionThrows: true })
    expect(applyPositionState(session, 100, 10, 1)).toBe(false)
  })

  it('no revienta en navegadores viejos que no tienen setPositionState', () => {
    const { session } = fakeSession({ noPositionState: true })
    expect(applyPositionState(session, 100, 10, 1)).toBe(false)
  })

  it('manda la posición cuando los valores son buenos', () => {
    const { session } = fakeSession()
    expect(applyPositionState(session, 100, 10, 1.25)).toBe(true)
    expect(session.setPositionState).toHaveBeenCalledWith({ duration: 100, position: 10, playbackRate: 1.25 })
  })
})

describe('setActionHandlerSafe', () => {
  it('UNA ACCIÓN NO SOPORTADA NO ARRASTRA A LAS DEMÁS — Safari lanza en seekto', () => {
    const { session, handlers } = fakeSession({ throwsOn: ['seekto'] })
    expect(setActionHandlerSafe(session, 'seekto', () => {})).toBe(false)
    expect(setActionHandlerSafe(session, 'nexttrack', () => {})).toBe(true)
    expect(handlers.get('nexttrack')).toBeTypeOf('function')
  })

  it('acepta null, que es como se deshabilita un botón del sistema', () => {
    const { session, handlers } = fakeSession()
    setActionHandlerSafe(session, 'nexttrack', null)
    expect(handlers.get('nexttrack')).toBeNull()
  })
})

describe('clearMediaSession', () => {
  it('deja la ficha del sistema vacía al salir del reproductor', () => {
    const { session, handlers } = fakeSession()
    MEDIA_SESSION_ACTIONS.forEach((a) => session.setActionHandler(a, () => {}))
    clearMediaSession(session)
    MEDIA_SESSION_ACTIONS.forEach((a) => expect(handlers.get(a)).toBeNull())
    expect(session.metadata).toBeNull()
    expect(session.playbackState).toBe('none')
  })
})

describe('buildArtwork', () => {
  it('sin portada deja el icono de la app, que funciona sin conexión', () => {
    const artwork = buildArtwork(null)
    expect(artwork).toHaveLength(1)
    expect(artwork[0].src).toContain('/pwa-512.png')
  })

  it('con portada la pone delante y deja el icono de reserva detrás', () => {
    const artwork = buildArtwork('https://ejemplo.test/foto.jpg')
    expect(artwork.map((a) => a.src)).toEqual([
      'https://ejemplo.test/foto.jpg',
      expect.stringContaining('/pwa-512.png'),
    ])
  })

  it('devuelve URLs absolutas', () => {
    expect(toAbsoluteUrl('/pwa-512.png')).toMatch(/^https?:\/\//)
  })
})

describe('qué acciones se registran', () => {
  it('NO REGISTRA seekbackward NI seekforward — en iOS taparían anterior/siguiente', () => {
    // La pantalla de bloqueo de iOS tiene DOS huecos junto al play. Si hay
    // manejadores de avance/retroceso, WebKit pone ahí los ±15 s y esconde los
    // botones de parada anterior y siguiente. Este test existe para que nadie
    // los vuelva a añadir "porque estaría bien tenerlos también".
    expect(ACCIONES_REGISTRADAS).not.toContain('seekbackward')
    expect(ACCIONES_REGISTRADAS).not.toContain('seekforward')
  })

  it('sí registra anterior y siguiente, que es lo que se quiere ver', () => {
    expect(ACCIONES_REGISTRADAS).toContain('nexttrack')
    expect(ACCIONES_REGISTRADAS).toContain('previoustrack')
  })

  it('mantiene seekto: no ocupa hueco y es lo que hace arrastrable la barra', () => {
    expect(ACCIONES_REGISTRADAS).toContain('seekto')
  })

  it('al limpiar borra TAMBIÉN las que ya no se registran', () => {
    // Una pestaña abierta desde antes del cambio las tiene puestas; sin
    // limpiarlas seguiría enseñando los botones equivocados.
    for (const a of ACCIONES_REGISTRADAS) expect(MEDIA_SESSION_ACTIONS).toContain(a)
    expect(MEDIA_SESSION_ACTIONS).toContain('seekbackward')
    expect(MEDIA_SESSION_ACTIONS).toContain('seekforward')
  })
})
