// Permisos de la cuenta, del lado del navegador.
//
// Estas reglas están DUPLICADAS en Postgres (`can_create_trips()`, migración
// 050) y esa duplicación es intencionada: la base de datos es quien manda, y
// esto solo existe para poder deshabilitar el botón con el motivo escrito
// debajo en vez de dejar que el usuario lo pulse y reciba un 403 mudo.
//
// Que estén duplicadas significa que pueden divergir, y si divergen el
// síntoma es feo: un botón activo que al pulsarlo falla. Por eso hay test de
// las dos ramas y por eso este fichero es puro (sin supabase, sin React).

export interface UserLimits {
  can_create_trips: boolean
  max_trips: number | null
  can_use_ai: boolean
  can_share_trips: boolean
  is_suspended: boolean
  notes: string | null
}

// Sin fila en `user_limits` = todo permitido. Es la misma regla que el
// `coalesce(..., true)` de las funciones SQL, y la que hace que un fallo
// creando la fila no deje a nadie fuera.
export const LIMITES_POR_DEFECTO: UserLimits = {
  can_create_trips: true,
  max_trips: null,
  can_use_ai: true,
  can_share_trips: true,
  is_suspended: false,
  notes: null,
}

/**
 * Por qué NO puede crear un viaje, o null si sí puede.
 * Devuelve el texto ya escrito: quien llama no tiene que decidir el motivo.
 */
export function bloqueoParaCrearViaje(
  l: UserLimits | null | undefined,
  viajesActuales: number,
): string | null {
  const lim = l ?? LIMITES_POR_DEFECTO
  if (lim.is_suspended) return 'Tu cuenta está suspendida. Escríbenos si crees que es un error.'
  if (!lim.can_create_trips) return 'Tu cuenta no puede crear viajes nuevos ahora mismo.'
  if (lim.max_trips != null && viajesActuales >= lim.max_trips) {
    return `Has llegado al máximo de ${lim.max_trips} viaje${lim.max_trips === 1 ? '' : 's'} de tu cuenta.`
  }
  return null
}

/** Por qué no puede editar nada del viaje, o null. */
export function bloqueoParaEditar(l: UserLimits | null | undefined): string | null {
  if ((l ?? LIMITES_POR_DEFECTO).is_suspended) {
    return 'Tu cuenta está suspendida: puedes ver y descargar tus viajes, pero no cambiarlos.'
  }
  return null
}

/** Por qué no puede compartir, o null. */
export function bloqueoParaCompartir(l: UserLimits | null | undefined): string | null {
  const lim = l ?? LIMITES_POR_DEFECTO
  if (lim.is_suspended) return 'Tu cuenta está suspendida y no puede compartir viajes.'
  if (!lim.can_share_trips) return 'Tu cuenta no puede compartir viajes ahora mismo.'
  return null
}
