import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Estado real del vuelo (Edge Function flight-status). El número sale de la
// reserva vinculada a la actividad: documents.flight_number.

export interface FlightPoint {
  iata: string | null
  airport: string | null
  /** Hora programada, en hora local del aeropuerto (ISO con offset). */
  scheduled: string | null
  /** Hora revisada/estimada; igual a la programada si no hay novedad. */
  estimated: string | null
  terminal: string | null
  gate: string | null
  checkInDesk: string | null
  /** Positivo = retraso; negativo = adelanto. null si no hay estimación. */
  delayMinutes: number | null
}

export interface FlightStatus {
  number: string
  /** Texto del proveedor: Expected, Departed, EnRoute, Arrived, Canceled… */
  status: string | null
  airline: string | null
  aircraft: string | null
  departure: FlightPoint
  arrival: FlightPoint
  fetchedAt: string
}

const DAY_MS = 86_400_000

/**
 * Cuántos días faltan (o han pasado) para la fecha del vuelo, contando por día
 * natural para que "hoy" siga siendo 0 a las 23:50.
 */
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  return Math.round((target - today) / DAY_MS)
}

/**
 * Solo se consulta cerca de la fecha: los proveedores no tienen estado de un
 * vuelo dentro de tres meses, así que preguntarlo solo gastaría cuota.
 */
export function flightStatusIsRelevant(date: string | null | undefined): boolean {
  if (!date) return false
  const d = daysUntil(date)
  return d >= -1 && d <= 2
}

export const flightStatusKeys = {
  one: (flightNumber: string, date: string) => ['flight-status', flightNumber, date] as const,
}

export function useFlightStatus(flightNumber: string | null | undefined, date: string | null | undefined) {
  const enabled = !!flightNumber && !!date && flightStatusIsRelevant(date)

  return useQuery({
    queryKey: flightStatusKeys.one(flightNumber ?? '', date ?? ''),
    enabled,
    // El día del vuelo el dato se mueve (puerta, retraso); los días de alrededor
    // no. Se refresca solo mientras estás viajando de verdad, y solo si hay algo
    // que refrescar: si el proveedor no conoce el vuelo, insistir cada 5 minutos
    // no lo va a cambiar y sí gasta cuota.
    staleTime: 1000 * 60 * 5,
    refetchInterval: (query) =>
      query.state.data && date && daysUntil(date) === 0 ? 1000 * 60 * 5 : false,
    // Sin reintentos: cada intento gasta cuota de la capa gratuita, y si falla
    // la tarjeta simplemente no se pinta.
    retry: false,
    queryFn: async (): Promise<FlightStatus | null> => {
      const { data, error } = await supabase.functions.invoke('flight-status', {
        body: { flightNumber, date },
      })
      // Cualquier fallo (secreto sin configurar, cuota agotada, proveedor caído)
      // se resuelve como "sin dato": esto es información de apoyo, y una tarjeta
      // en rojo sobre un vuelo que va bien asusta más de lo que informa.
      if (error) {
        console.warn('[flight-status] sin dato:', error.message)
        return null
      }
      if (!data?.found) return null
      return data as FlightStatus
    },
  })
}
