import { useQuery } from '@tanstack/react-query'
import { geocodeDestination } from '@/lib/queries/weather'
import type { Trip } from '@/types/database'

// Clima TÍPICO del destino en las fechas del viaje, a partir de los últimos diez
// años (Open-Meteo archive, gratis y sin clave).
//
// Hace falta porque la previsión solo llega a 16 días: un viaje que estás
// planificando a tres meses vista no muestra clima ninguno, y encima lo hace en
// silencio (useTripWeather busca la fecha en la respuesta, no la encuentra y
// resuelve con {}). Justo cuando más falta hace, para saber qué meter en la
// maleta.
//
// No sustituye a la previsión: es el respaldo para cuando no la hay.

export interface ClimateNormal {
  /** Media de las máximas en esas fechas. */
  tmax: number
  /** Media de las mínimas. */
  tmin: number
  /** Proporción de días con lluvia apreciable (0–1). */
  rainyRatio: number
  /** Años de histórico con los que se ha calculado. */
  years: number
}

const YEARS = 10
/** Un día "de lluvia" a efectos de maleta. */
const RAIN_MM = 1

export function useTripClimate(trip: Trip | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['climate', trip?.id],
    enabled: !!trip && enabled,
    staleTime: Infinity,                    // el clima típico no cambia
    gcTime: 1000 * 60 * 60 * 24 * 60,
    queryFn: async (): Promise<ClimateNormal | null> => {
      const coords = await geocodeDestination(trip!)
      if (!coords) return null
      const { lat, lng } = coords
      const thisYear = new Date().getFullYear()

      // Mismas fechas del viaje, año por año hacia atrás. Se piden todos los
      // rangos en una sola petición imposible, así que van en paralelo — pero
      // son 10 llamadas a un archivo gratuito, cacheadas para siempre.
      const requests = Array.from({ length: YEARS }, (_, i) => {
        const year = thisYear - 1 - i
        const start = `${year}${trip!.start_date.slice(4)}`
        const end = `${year}${trip!.end_date.slice(4)}`
        return fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`
          + `&start_date=${start}&end_date=${end}`
          + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      })

      const results = await Promise.all(requests)

      const maxs: number[] = []
      const mins: number[] = []
      let rainyDays = 0
      let totalDays = 0
      let years = 0

      for (const data of results) {
        const daily = data?.daily
        if (!daily?.time?.length) continue
        years++
        for (let i = 0; i < daily.time.length; i++) {
          const tmax = daily.temperature_2m_max?.[i]
          const tmin = daily.temperature_2m_min?.[i]
          const rain = daily.precipitation_sum?.[i]
          if (typeof tmax === 'number') maxs.push(tmax)
          if (typeof tmin === 'number') mins.push(tmin)
          if (typeof rain === 'number') {
            totalDays++
            if (rain >= RAIN_MM) rainyDays++
          }
        }
      }

      if (maxs.length === 0 || mins.length === 0) return null

      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
      return {
        tmax: Math.round(mean(maxs)),
        tmin: Math.round(mean(mins)),
        rainyRatio: totalDays > 0 ? rainyDays / totalDays : 0,
        years,
      }
    },
  })
}
