import { describe, it, expect, beforeEach } from 'vitest'
import { readStoredSession } from './storedSession'

const session = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 1,
  user: { id: 'u1' },
}

beforeEach(() => localStorage.clear())

describe('readStoredSession', () => {
  it('encuentra la sesión que guarda supabase-js', () => {
    localStorage.setItem('sb-abcdef-auth-token', JSON.stringify(session))

    expect(readStoredSession()?.user.id).toBe('u1')
  })

  it('lee también el formato en base64url', () => {
    const b64 = btoa(JSON.stringify(session)).replace(/\+/g, '-').replace(/\//g, '_')
    localStorage.setItem('sb-abcdef-auth-token', `base64-${b64}`)

    expect(readStoredSession()?.access_token).toBe('at')
  })

  it('devuelve null si no hay sesión guardada', () => {
    localStorage.setItem('wanderlog-cache', '{"clientState":{}}')

    expect(readStoredSession()).toBeNull()
  })

  it('devuelve null si lo guardado está corrupto o a medias', () => {
    localStorage.setItem('sb-abcdef-auth-token', '{roto')
    expect(readStoredSession()).toBeNull()

    localStorage.clear()
    localStorage.setItem('sb-abcdef-auth-token', JSON.stringify({ access_token: 'at' }))
    expect(readStoredSession()).toBeNull()
  })
})
