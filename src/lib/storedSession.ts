import type { Session } from '@supabase/supabase-js'

// supabase-js guarda la sesión en localStorage bajo `sb-<ref-del-proyecto>-auth-token`.
// No fijamos la clave a mano al crear el cliente porque cambiarla dejaría fuera
// a quien ya tiene sesión abierta; la buscamos por su forma.
const KEY_RE = /^sb-.+-auth-token$/

function decode(raw: string): unknown {
  // Algunos almacenamientos guardan el JSON en base64url.
  if (raw.startsWith('base64-')) {
    const b64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  }
  return JSON.parse(raw)
}

/**
 * La sesión tal cual está guardada en el dispositivo, sin pasar por la red.
 *
 * Hace falta porque `supabase.auth.getSession()` no sirve sin cobertura: si el
 * token de acceso ha caducado intenta renovarlo, tarda ~20 s en rendirse y
 * devuelve `null` aunque la sesión siga guardada (el refresh token no se ha
 * tocado). Con eso, quien abre la app en modo avión acababa en el login.
 *
 * Solo decide qué se pinta: los datos los sigue protegiendo el servidor.
 */
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !KEY_RE.test(key)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = decode(raw) as { currentSession?: unknown } | null
      const session = (parsed && 'currentSession' in parsed ? parsed.currentSession : parsed) as Session | null
      if (session?.access_token && session.refresh_token && session.user) return session
    }
  } catch {
    // localStorage capado o JSON corrupto: como si no hubiera sesión guardada.
  }
  return null
}
