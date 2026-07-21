// Token de la invitación que se estaba aceptando cuando hizo falta iniciar
// sesión. Al volver de Google / del enlace mágico se aterriza siempre en
// /auth/callback, que lo lee para devolver a /invite/<token> en vez de al
// dashboard. Se hace por localStorage y no con `redirectTo` para no tener que
// añadir URLs nuevas a la allowlist de Supabase.
//
// Vive en su propio módulo porque AuthCallback va en el bundle principal: si
// lo importara de InvitePage se llevaría por delante su carga diferida.
const KEY = 'wanderlog:pending-invite'

export const rememberPendingInvite = (token: string) => {
  try { localStorage.setItem(KEY, token) } catch { /* modo privado */ }
}

// Lo devuelve y lo borra: si el login se queda a medias no queremos que
// semanas después un acceso normal acabe en una invitación vieja.
export const takePendingInvite = (): string | null => {
  try {
    const token = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    return token
  } catch {
    return null
  }
}

export const clearPendingInvite = () => {
  try { localStorage.removeItem(KEY) } catch { /* modo privado */ }
}
