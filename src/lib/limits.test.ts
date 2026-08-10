import { describe, it, expect } from 'vitest'
import {
  bloqueoParaCrearViaje, bloqueoParaEditar, bloqueoParaCompartir,
  LIMITES_POR_DEFECTO, type UserLimits,
} from './limits'

const con = (p: Partial<UserLimits>): UserLimits => ({ ...LIMITES_POR_DEFECTO, ...p })

describe('bloqueoParaCrearViaje', () => {
  it('SIN FILA NO BLOQUEA — es el caso de casi todo el mundo y el que no puede fallar', () => {
    expect(bloqueoParaCrearViaje(null, 0)).toBeNull()
    expect(bloqueoParaCrearViaje(undefined, 99)).toBeNull()
    expect(bloqueoParaCrearViaje(LIMITES_POR_DEFECTO, 500)).toBeNull()
  })

  it('la suspensión manda sobre el resto de motivos', () => {
    // Con la cuenta suspendida el permiso de crear da igual: el mensaje que
    // hay que dar es el de la suspensión, no el otro.
    const l = con({ is_suspended: true, can_create_trips: true })
    expect(bloqueoParaCrearViaje(l, 0)).toContain('suspendida')
  })

  it('bloquea cuando no puede crear', () => {
    expect(bloqueoParaCrearViaje(con({ can_create_trips: false }), 0))
      .toBe('Tu cuenta no puede crear viajes nuevos ahora mismo.')
  })

  it('el tope compara con >=, la misma frontera que el count(*) < max de SQL', () => {
    const l = con({ max_trips: 3 })
    expect(bloqueoParaCrearViaje(l, 2)).toBeNull()      // tiene 2, crea la 3ª
    expect(bloqueoParaCrearViaje(l, 3)).toContain('máximo de 3 viajes')
    expect(bloqueoParaCrearViaje(l, 4)).not.toBeNull()  // ya se pasó
  })

  it('singulariza el tope de 1: "1 viaje", no "1 viajes"', () => {
    expect(bloqueoParaCrearViaje(con({ max_trips: 1 }), 1)).toContain('máximo de 1 viaje de tu cuenta')
  })

  it('max_trips 0 bloquea desde el principio, no se confunde con null', () => {
    expect(bloqueoParaCrearViaje(con({ max_trips: 0 }), 0)).not.toBeNull()
    expect(bloqueoParaCrearViaje(con({ max_trips: null }), 0)).toBeNull()
  })
})

describe('bloqueoParaEditar', () => {
  it('solo la suspensión bloquea editar', () => {
    expect(bloqueoParaEditar(con({ can_create_trips: false }))).toBeNull()
    expect(bloqueoParaEditar(con({ is_suspended: true }))).toContain('suspendida')
  })

  it('dice que SÍ se puede ver y descargar: suspender no es borrar', () => {
    expect(bloqueoParaEditar(con({ is_suspended: true }))).toContain('descargar')
  })
})

describe('bloqueoParaCompartir', () => {
  it('bloquea por suspensión o por permiso, y no bloquea por defecto', () => {
    expect(bloqueoParaCompartir(null)).toBeNull()
    expect(bloqueoParaCompartir(con({ can_share_trips: false }))).not.toBeNull()
    expect(bloqueoParaCompartir(con({ is_suspended: true }))).toContain('suspendida')
  })
})
