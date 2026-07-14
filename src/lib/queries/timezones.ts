import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { isMove } from '@/lib/travelTime'
import { computeDayZones, type DayZones } from '@/lib/dayTz'
import type { Activity, ItineraryDay } from '@/types/database'

// Resolución de la zona IANA de una coordenada, con Open-Meteo: gratis, sin
// clave, ~150 bytes de respuesta. No hace falta pedir ninguna variable
// meteorológica, solo `timezone=auto`.
//
// La resolución es fina de verdad (Ayamonte devuelve Europe/Madrid y Vila Real,
// a 2 km, Europe/Lisbon), así que es de fiar para aeropuertos.
//
// ⚠️ El nombre IANA sirve para la ARITMÉTICA, nunca como etiqueta que enseñar:
// Tijuana devuelve 'America/Los_Angeles' (mismo offset y mismas reglas, así que
// las cuentas salen), y mostrar "sale de Los Ángeles" sería falso. Las ciudades
// que se pintan salen de activity.origin / activity.destination.

/** Redondeo a ~1 km: dos actividades en el mismo aeropuerto comparten llamada. */
const tzKey = (lat: number, lng: number) =>
  ['timezone', lat.toFixed(2), lng.toFixed(2)] as const

export async function resolveTimezone(lat: number, lng: number): Promise<string | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=auto`,
  )
  // Un fallo de red se propaga a propósito: react-query no debe cachearlo como
  // un "no se sabe" definitivo. `null` sí es cacheable (Open-Meteo no lo supo).
  if (!res.ok) throw new Error(`open-meteo tz ${res.status}`)
  const data = await res.json()
  return typeof data?.timezone === 'string' ? data.timezone : null
}

const tzQueryOptions = (lat: number, lng: number) => ({
  queryKey: tzKey(lat, lng),
  queryFn: () => resolveTimezone(lat, lng),
  staleTime: Infinity,                     // una coordenada no cambia de huso
  gcTime: 1000 * 60 * 60 * 24 * 60,        // 60 días, persistido en localStorage
})

interface Pending {
  activityId: string
  column: 'origin_tz' | 'destination_tz'
  lat: number
  lng: number
}

// Movimientos a los que les falta el huso de alguna punta y sí tienen su
// coordenada.
function pendingTimezones(activities: Activity[]): Pending[] {
  const out: Pending[] = []
  for (const a of activities) {
    if (!isMove(a)) continue
    if (!a.origin_tz && a.origin_lat != null && a.origin_lng != null) {
      out.push({ activityId: a.id, column: 'origin_tz', lat: a.origin_lat, lng: a.origin_lng })
    }
    if (!a.destination_tz && a.destination_lat != null && a.destination_lng != null) {
      out.push({ activityId: a.id, column: 'destination_tz', lat: a.destination_lat, lng: a.destination_lng })
    }
  }
  return out
}

/**
 * Resuelve los husos que faltan y los ESCRIBE en la BD, para no volver a
 * preguntarlos nunca (mismo patrón que useBackfillRoutePoints).
 *
 * Se hace aquí, en segundo plano, y NO al guardar la actividad: meter una
 * llamada a un tercero en la ruta de guardado la volvería lenta y frágil, y
 * duplicaría la lógica en dos caminos que acabarían divergiendo.
 *
 * Devuelve los husos resueltos aunque la escritura falle (colaborador `viewer`,
 * o sin conexión): la pantalla funciona igual, solo que se re-resuelven por
 * dispositivo. Los husos NO se encolan en el outbox: no son datos del usuario.
 */
export function useBackfillTimezones(
  tripId: string | undefined,
  activities: Activity[] | undefined,
  days: ItineraryDay[] | undefined,
  canEdit: boolean,
): DayZones {
  const qc = useQueryClient()
  const [resolved, setResolved] = useState<Record<string, string>>({})
  // Clave "actividad:columna" ya intentada: si una coordenada no se puede
  // resolver, no se reintenta en cada render.
  const attempted = useRef(new Set<string>())

  const pending = useMemo(() => pendingTimezones(activities ?? []), [activities])

  useEffect(() => {
    if (!tripId || pending.length === 0) return
    let cancelled = false

    void (async () => {
      let saved = false
      for (const p of pending) {
        const key = `${p.activityId}:${p.column}`
        if (attempted.current.has(key)) continue
        attempted.current.add(key)

        let tz: string | null = null
        try { tz = await qc.fetchQuery(tzQueryOptions(p.lat, p.lng)) } catch { tz = null }
        if (cancelled) return
        if (!tz) continue

        setResolved(prev => ({ ...prev, [key]: tz! }))
        if (!canEdit) continue

        const patch = p.column === 'origin_tz'
          ? { origin_tz: tz }
          : { destination_tz: tz }
        const { error } = await supabase
          .from('activities')
          .update(patch)
          .eq('id', p.activityId)
        if (!error) saved = true
      }
      if (!cancelled && saved) {
        qc.invalidateQueries({ queryKey: itineraryKeys.activities(tripId) })
      }
    })()

    return () => { cancelled = true }
  }, [tripId, canEdit, pending, qc])

  // Las actividades con los husos recién resueltos aplicados encima, para que la
  // pantalla no tenga que esperar a que vuelva la escritura.
  const withZones = useMemo(() => (activities ?? []).map(a => {
    const origin = resolved[`${a.id}:origin_tz`]
    const destination = resolved[`${a.id}:destination_tz`]
    if (!origin && !destination) return a
    return {
      ...a,
      origin_tz: a.origin_tz ?? origin ?? null,
      destination_tz: a.destination_tz ?? destination ?? null,
    }
  }), [activities, resolved])

  const zones = useMemo(
    () => computeDayZones(days ?? [], withZones),
    [days, withZones],
  )

  // El huso del día se DEDUCE de los movimientos, pero además se guarda: así
  // está disponible sin tener que cargar las actividades (y es lo que permitirá
  // programar los avisos en la hora del destino, que hoy salen en la del móvil).
  useEffect(() => {
    if (!tripId || !canEdit || !days?.length) return
    const stale = days.filter(d => {
      const zone = zones.tzByDay.get(d.id)
      return zone && zone !== d.tz
    })
    if (stale.length === 0) return

    let cancelled = false
    void (async () => {
      for (const d of stale) {
        if (cancelled) return
        await supabase
          .from('itinerary_days')
          .update({ tz: zones.tzByDay.get(d.id)! })
          .eq('id', d.id)
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: itineraryKeys.days(tripId) })
    })()

    return () => { cancelled = true }
  }, [tripId, canEdit, days, zones, qc])

  return zones
}
