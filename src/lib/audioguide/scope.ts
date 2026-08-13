// De quién es una audioguía. Hasta la migración 056 solo podía ser de una
// actividad, así que el id de la actividad viajaba suelto por todo el flujo
// (queries, borrador, ruta del storage). Ahora que también puede ser de la
// ciudad de un día, ese id suelto se convierte en este par: el resto del
// código pasa a hablar de "ámbito" y deja de suponer que hay una actividad.
export type AudioguideScope =
  | { kind: 'activity'; id: string }
  | { kind: 'day'; id: string }

// De una fila de `audioguides` al ámbito. Devuelve null si no tiene ninguno de
// los dos: no debería pasar (lo impide audioguides_scope_chk), pero la caché
// offline puede devolver filas guardadas por una versión anterior.
export function audioguideScope(
  row: { activity_id: string | null; day_id: string | null },
): AudioguideScope | null {
  if (row.activity_id) return { kind: 'activity', id: row.activity_id }
  if (row.day_id) return { kind: 'day', id: row.day_id }
  return null
}

/** La columna de `audioguides` que guarda el ámbito (ver 056). */
export function scopeColumn(scope: AudioguideScope): 'activity_id' | 'day_id' {
  return scope.kind === 'activity' ? 'activity_id' : 'day_id'
}

/** Clave estable para cachés y borradores. */
export function scopeKey(scope: AudioguideScope): string {
  return `${scope.kind}:${scope.id}`
}

/** Ruta de la pantalla de audioguía del ámbito. */
export function scopeRoute(tripId: string, scope: AudioguideScope): string {
  return scope.kind === 'activity'
    ? `/trips/${tripId}/itinerary/${scope.id}/audioguide`
    : `/trips/${tripId}/dias/${scope.id}/audioguide`
}

// Carpeta de los MP3 dentro del bucket. Los ids de actividad y de día son uuid
// y nunca coinciden, así que el mismo esquema de tres niveles vale para los dos
// y el borrado por prefijo de useDeleteAudioguide sigue funcionando igual.
export function stopStoragePath(
  userId: string,
  tripId: string,
  scope: AudioguideScope,
  stopId: string,
): string {
  return `${userId}/${tripId}/${scope.id}/${stopId}.mp3`
}

export function stopStoragePrefix(userId: string, tripId: string, scope: AudioguideScope): string {
  return `${userId}/${tripId}/${scope.id}`
}
