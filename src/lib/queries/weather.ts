import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { Trip, ItineraryDay, Activity } from '@/types/database'

export interface DayWeather {
  code: number
  tmax: number
  tmin: number
}

// Icono según el código WMO de Open-Meteo.
export function weatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

interface OpenMeteoDaily {
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] }
}

// Respaldo compartido: geocodificar el destino del viaje (también Open-Meteo).
export async function geocodeDestination(trip: Trip): Promise<{ lat: number; lng: number } | null> {
  try {
    const name = trip.destination.split(',')[0].trim()
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es`)
    const j = await r.json()
    return j.results?.[0] ? { lat: j.results[0].latitude, lng: j.results[0].longitude } : null
  } catch {
    return null
  }
}

// Previsión por día del itinerario (Open-Meteo, gratis y sin API key).
// Usa las coordenadas de la primera actividad de cada día; si un día no
// tiene, cae al destino del viaje geocodificado. Solo cubre ~16 días vista.
export function useTripWeather(trip?: Trip | null, days?: ItineraryDay[], activities?: Activity[]) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const enabled = !!trip && !!days?.length && trip.end_date >= today

  return useQuery({
    queryKey: ['weather', trip?.id],
    enabled,
    staleTime: 1000 * 60 * 60, // 1 h
    retry: 1,
    queryFn: async (): Promise<Record<string, DayWeather>> => {
      const dayDate = new Map(days!.map(d => [d.id, d.date]))

      // Coordenada del día: la primera actividad con ubicación.
      const coordForDay = new Map<string, { lat: number; lng: number }>()
      const sorted = [...(activities ?? [])].sort((a, b) => a.order_index - b.order_index)
      for (const a of sorted) {
        const date = dayDate.get(a.day_id)
        if (!date || coordForDay.has(date)) continue
        const lat = a.lat ?? a.destination_lat ?? a.origin_lat
        const lng = a.lng ?? a.destination_lng ?? a.origin_lng
        if (lat != null && lng != null) coordForDay.set(date, { lat, lng })
      }

      // Respaldo: geocodificar el destino del viaje.
      const fallback = days!.some(d => !coordForDay.has(d.date))
        ? await geocodeDestination(trip!)
        : null

      // Ubicaciones únicas (redondeadas a ~10 km) → una sola petición.
      const key = (c: { lat: number; lng: number }) => `${c.lat.toFixed(1)},${c.lng.toFixed(1)}`
      const locs = new Map<string, { lat: number; lng: number }>()
      for (const d of days!) {
        const c = coordForDay.get(d.date) ?? fallback
        if (c) locs.set(key(c), c)
      }
      if (!locs.size) return {}

      const arr = [...locs.values()]
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${arr.map(c => c.lat).join(',')}&longitude=${arr.map(c => c.lng).join(',')}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`open-meteo ${res.status}`)
      const data = await res.json()
      const list: OpenMeteoDaily[] = Array.isArray(data) ? data : [data]
      const byKey = new Map<string, OpenMeteoDaily>()
      ;[...locs.keys()].forEach((k, i) => byKey.set(k, list[i]))

      const out: Record<string, DayWeather> = {}
      for (const d of days!) {
        const c = coordForDay.get(d.date) ?? fallback
        if (!c) continue
        const f = byKey.get(key(c))
        const idx = f?.daily?.time.indexOf(d.date) ?? -1
        if (idx < 0 || !f?.daily) continue
        out[d.date] = {
          code: f.daily.weather_code[idx],
          tmax: Math.round(f.daily.temperature_2m_max[idx]),
          tmin: Math.round(f.daily.temperature_2m_min[idx]),
        }
      }
      return out
    },
  })
}

export interface TodayHourly {
  timezone: string // IANA del destino, p. ej. "Asia/Singapore"
  utcOffsetSeconds: number
  hours: { time: string; temp: number; precipProb: number; code: number }[]
}

// Hora actual del destino como "yyyy-MM-ddTHH", comparable con los `time`
// horarios de Open-Meteo (que vienen en hora local del destino).
export function destinationHourKey(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`
}

// Previsión por HORAS de hoy (una sola coordenada: la primera actividad de hoy
// con ubicación, o el destino geocodificado). Query key con la fecha para no
// arrastrar el día anterior tras medianoche; el timezone de la respuesta
// alimenta también la "hora local del destino" del TodayHub.
export function useTodayWeatherHourly(trip?: Trip | null, days?: ItineraryDay[], activities?: Activity[]) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const enabled = !!trip && !!days?.length && trip.start_date <= today && trip.end_date >= today

  return useQuery({
    queryKey: ['weather-hourly', trip?.id, today],
    enabled,
    staleTime: 1000 * 60 * 30, // 30 min
    retry: 1,
    queryFn: async (): Promise<TodayHourly | null> => {
      const todayDay = days!.find(d => d.date === today)
      let coord: { lat: number; lng: number } | null = null
      if (todayDay) {
        const sorted = (activities ?? [])
          .filter(a => a.day_id === todayDay.id)
          .sort((a, b) => a.order_index - b.order_index)
        for (const a of sorted) {
          const lat = a.lat ?? a.destination_lat ?? a.origin_lat
          const lng = a.lng ?? a.destination_lng ?? a.origin_lng
          if (lat != null && lng != null) { coord = { lat, lng }; break }
        }
      }
      if (!coord) coord = await geocodeDestination(trip!)
      if (!coord) return null

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lng}` +
        `&hourly=temperature_2m,precipitation_probability,weather_code&timezone=auto&forecast_days=1`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`open-meteo ${res.status}`)
      const data = await res.json()
      const h = data.hourly as
        | { time: string[]; temperature_2m: number[]; precipitation_probability?: number[]; weather_code: number[] }
        | undefined
      if (!h?.time?.length) return null
      return {
        timezone: data.timezone ?? 'UTC',
        utcOffsetSeconds: data.utc_offset_seconds ?? 0,
        hours: h.time.map((time, i) => ({
          time,
          temp: Math.round(h.temperature_2m[i]),
          precipProb: h.precipitation_probability?.[i] ?? 0,
          code: h.weather_code[i],
        })),
      }
    },
  })
}
