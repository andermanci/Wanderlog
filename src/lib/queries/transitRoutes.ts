import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { haversineKm, pairKey, transitSig, type TravelLeg } from '@/lib/travelTime'
import type { PendingLeg } from '@/lib/queries/travelTime'
import type { TransitRoute } from '@/types/database'
import { transitVerdict, walkMeters, walkMinutes, type TransitRow } from '@/lib/transit/exchange'

// Sugerencias de transporte público para los trayectos "en coche" del
// itinerario (tabla transit_routes, 062). Se generan una vez, al organizar el
// viaje, pegando en una IA el prompt que arma la app: no es tiempo real.
//
// La query se persiste en IndexedDB como el resto (queryPersister), así que
// las rutas siguen disponibles sin conexión.

const key = (tripId: string) => ['transitRoutes', tripId] as const

export function useTransitRoutes(tripId: string | undefined) {
  return useQuery({
    queryKey: key(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transit_routes')
        .select('*')
        .eq('trip_id', tripId!)
      if (error) throw error
      return data as TransitRoute[]
    },
  })
}

// Guarda las rutas que el usuario trae de su IA (copia y pega, ver
// src/lib/transit/exchange.ts). Escribe directo en la tabla: la RLS deja a
// quien puede editar el viaje.
export function useSaveTransitRoutes(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: TransitRow[]) => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('transit_routes')
        .upsert(rows.map(r => ({ ...r, trip_id: tripId, generated_at: now })), { onConflict: 'from_activity_id,to_activity_id' })
        .select()
      if (error) throw error
      return data as TransitRoute[]
    },
    onSuccess: (routes) => {
      qc.setQueryData<TransitRoute[]>(key(tripId), (old) => {
        const byPair = new Map((old ?? []).map(r => [pairKey(r.from_activity_id, r.to_activity_id), r]))
        routes.forEach(r => byPair.set(pairKey(r.from_activity_id, r.to_activity_id), r))
        return [...byPair.values()]
      })
      qc.invalidateQueries({ queryKey: key(tripId) })
    },
  })
}

export interface DayTransit {
  /** Rutas vigentes de los trayectos en coche del día, por pairKey. */
  routes: Map<string, TransitRoute>
  /** Trayectos en coche sin sugerencia, o con una caducada (se movió una parada). */
  pending: PendingLeg[]
}

// Cruza los trayectos en coche de un día con las rutas guardadas. Una ruta
// solo vale si los extremos siguen en el mismo sitio que cuando se generó.
export function dayTransit(drivingLegs: PendingLeg[], rowsByPair: Map<string, TransitRoute>): DayTransit {
  const routes = new Map<string, TransitRoute>()
  const pending: PendingLeg[] = []
  for (const leg of drivingLegs) {
    const k = pairKey(leg.fromId, leg.toId)
    const row = rowsByPair.get(k)
    if (row && row.coords_sig === transitSig(leg.origin, leg.destination)) routes.set(k, row)
    else pending.push(leg)
  }
  return { routes, pending }
}

// El trayecto tal como se usa para pintar el conector, sumar el día y detectar
// conflictos: si hay una ruta en transporte público que compensa, manda ella;
// si no compensa y lo mejor es ir andando, el trayecto pasa a ser a pie.
export function effectiveLeg(drive: TravelLeg | undefined, route: TransitRoute | undefined, pending?: PendingLeg): TravelLeg | undefined {
  if (!route) return drive
  const verdict = pending ? transitVerdict(route, pending.origin, pending.destination) : null
  if ((verdict ? verdict.worth : route.worth_it) && route.total_minutes != null) {
    const distanceMeters = drive?.distanceMeters
      ?? (pending ? haversineKm(pending.origin, pending.destination) * 1000 : 0)
    return { mode: 'TRANSIT', distanceMeters, durationSeconds: route.total_minutes * 60 }
  }
  if (pending && verdict?.alternative === 'walk') {
    return {
      mode: 'WALKING',
      distanceMeters: walkMeters(pending.origin, pending.destination),
      durationSeconds: walkMinutes(pending.origin, pending.destination) * 60,
    }
  }
  return drive
}
