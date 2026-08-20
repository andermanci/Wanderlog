import { describe, it, expect } from 'vitest'
import {
  audioguideScope, scopeColumn, scopeKey, scopeRoute,
  stopStoragePath, stopStoragePrefix, type AudioguideScope,
} from './scope'

const ACT: AudioguideScope = { kind: 'activity', id: 'act-1' }
const DIA: AudioguideScope = { kind: 'day', id: 'day-1' }

describe('scopeColumn', () => {
  it('mapea cada ámbito a su columna de audioguides', () => {
    expect(scopeColumn(ACT)).toBe('activity_id')
    expect(scopeColumn(DIA)).toBe('day_id')
  })
})

describe('scopeKey', () => {
  it('distingue una actividad de un día aunque compartieran id', () => {
    expect(scopeKey({ kind: 'activity', id: 'x' })).not.toBe(scopeKey({ kind: 'day', id: 'x' }))
  })
})

describe('scopeRoute', () => {
  it('la audioguía de actividad cuelga de su detalle', () => {
    expect(scopeRoute('t1', ACT)).toBe('/trips/t1/itinerary/act-1/audioguide')
  })

  it('la audioguía de día cuelga de /dias para no chocar con :activityId', () => {
    expect(scopeRoute('t1', DIA)).toBe('/trips/t1/dias/day-1/audioguide')
  })
})

describe('audioguideScope', () => {
  it('deduce el ámbito de una fila de actividad', () => {
    expect(audioguideScope({ activity_id: 'a', day_id: null })).toEqual({ kind: 'activity', id: 'a' })
  })

  it('deduce el ámbito de una fila de día', () => {
    expect(audioguideScope({ activity_id: null, day_id: 'd' })).toEqual({ kind: 'day', id: 'd' })
  })

  // No debería ocurrir (lo impide audioguides_scope_chk), pero la caché offline
  // puede devolver filas viejas: mejor null que una audioguía a medio construir.
  it('devuelve null si la fila no tiene ninguno de los dos', () => {
    expect(audioguideScope({ activity_id: null, day_id: null })).toBeNull()
  })
})

describe('rutas del storage', () => {
  it('mantiene el esquema de tres niveles para los dos ámbitos', () => {
    expect(stopStoragePath('u1', 't1', ACT, 's1')).toBe('u1/t1/act-1/s1.mp3')
    expect(stopStoragePath('u1', 't1', DIA, 's1')).toBe('u1/t1/day-1/s1.mp3')
  })

  // El prefijo tiene que ser exactamente la carpeta de la que cuelgan los mp3,
  // sin barra final.
  it('el prefijo es la carpeta de los mp3', () => {
    const prefijo = stopStoragePrefix('u1', 't1', DIA)
    expect(prefijo).toBe('u1/t1/day-1')
    expect(stopStoragePath('u1', 't1', DIA, 's1')).toBe(`${prefijo}/s1.mp3`)
  })

  /**
   * Al mudar los audios a Cloudflare R2 se conservó la forma de la ruta a
   * propósito: la clave en R2 es IDÉNTICA a la que el fichero tenía dentro del
   * bucket de Supabase. De ahí dependen dos cosas:
   *
   *   · que la clave de caché no cambie y nadie se vuelva a descargar los
   *     viajes que ya tenía (ver el contrato en audioCache.test.ts), y
   *   · que el script de migración pueda copiar clave a clave, sin remapear.
   *
   * El `userId` que abre la ruta ya no autoriza nada —en Supabase era la
   * carpeta que miraban las políticas RLS del bucket; en R2 quien autoriza es
   * la Edge Function—, pero se mantiene por esas dos razones.
   */
  it('la ruta vale tal cual como clave de R2', () => {
    expect(stopStoragePath('u1', 't1', ACT, 's1')).toBe('u1/t1/act-1/s1.mp3')
    expect(stopStoragePath('u1', 't1', ACT, 's1')).not.toMatch(/^\//)
  })
})
