import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, BedDouble, Receipt, Map as MapIcon, CalendarDays, ChevronRight } from 'lucide-react'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { useTripWeather, weatherIcon } from '@/lib/queries/weather'
import { lodgingByDayMap } from '@/lib/lodging'
import { ACTIVITY_COLORS } from '@/lib/utils'
import type { Trip, Activity, ItineraryDay } from '@/types/database'

const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

// Centro del día: qué tienes ahora y a continuación, tiempo y dónde duermes.
// Se muestra solo cuando el viaje está en curso (lo decide TripDetail).
export function TodayHub({ trip, activities, days }: {
  trip: Trip
  activities: Activity[] | undefined
  days: ItineraryDay[] | undefined
}) {
  const { data: weather } = useTripWeather(trip, days, activities)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDay = days?.find(d => d.date === todayStr)

  const todayActs = useMemo(() => {
    if (!todayDay) return []
    return (activities ?? [])
      .filter(a => a.day_id === todayDay.id && a.type !== 'hotel')
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
  }, [activities, todayDay])

  const { current, next } = useMemo(() => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const timed = todayActs.filter(a => a.start_time)
    const current = timed.find(a => toMin(a.start_time!) <= nowMin && (a.end_time ? toMin(a.end_time) >= nowMin : false)) ?? null
    const next = timed.find(a => toMin(a.start_time!) > nowMin) ?? null
    return { current, next }
  }, [todayActs])

  const lodging = todayDay ? lodgingByDayMap(activities, days).get(todayDay.id)?.[0] : undefined
  const w = weather?.[todayStr]
  const featured = current ?? next ?? todayActs[0] ?? null

  if (!todayDay) return null

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--card))', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)' }}>
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-serif text-xl font-medium flex items-center gap-2">
          <CalendarDays size={18} style={{ color: 'var(--primary)' }} />
          Hoy <span className="text-sm font-normal text-muted-foreground capitalize">· {format(parseISO(todayStr), "EEEE d 'de' MMM", { locale: es })}</span>
        </h2>
        {w && (
          <span className="flex items-center gap-1 text-sm flex-shrink-0">
            <span className="text-lg leading-none">{weatherIcon(w.code)}</span>
            <span className="font-medium">{w.tmax}°</span>
            <span className="opacity-60 text-xs">/ {w.tmin}°</span>
          </span>
        )}
      </div>

      {/* Ahora / A continuación */}
      {featured ? (
        <Link
          to={`/trips/${trip.id}/itinerary/${featured.id}`}
          className="flex items-center gap-3 p-3 rounded-xl mb-3 transition-colors hover:brightness-[1.02]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {featured.cover_image_url ? (
            <img src={featured.cover_image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${ACTIVITY_COLORS[featured.type]} 14%, transparent)` }}>
              <ActivityIcon type={featured.type} size={20} style={{ color: ACTIVITY_COLORS[featured.type] }} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              {current ? 'Ahora' : next ? 'A continuación' : 'Hoy'}
            </p>
            <p className="font-medium line-clamp-1">{featured.title}</p>
            {featured.start_time && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock size={11} /> {featured.start_time.slice(0, 5)}{featured.end_time && ` — ${featured.end_time.slice(0, 5)}`}
              </p>
            )}
          </div>
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground mb-3">No hay actividades planificadas para hoy.</p>
      )}

      {/* Dónde duermes esta noche */}
      {lodging && lodging.role !== 'out' && (
        <Link to={`/trips/${trip.id}/itinerary/${lodging.activity.id}`}
          className="flex items-center gap-2 text-sm mb-3 px-1">
          <BedDouble size={15} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
          <span className="text-muted-foreground">Esta noche:</span>
          <span className="font-medium truncate">{lodging.activity.title}</span>
        </Link>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-3 gap-2">
        <Link to={`/trips/${trip.id}/itinerary?day=${todayStr}`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <CalendarDays size={16} style={{ color: 'var(--primary)' }} /> Itinerario
        </Link>
        <Link to={`/trips/${trip.id}/map`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <MapIcon size={16} style={{ color: 'var(--primary)' }} /> Mapa
        </Link>
        <Link to={`/trips/${trip.id}/expenses`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <Receipt size={16} style={{ color: 'var(--primary)' }} /> Gasto
        </Link>
      </div>

      {/* Resto de actividades de hoy */}
      {todayActs.length > 1 && (
        <div className="mt-3 space-y-1">
          {todayActs.filter(a => a.id !== featured?.id).map(a => (
            <Link key={a.id} to={`/trips/${trip.id}/itinerary/${a.id}`}
              className="flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-secondary transition-colors">
              <span className="text-xs tabular-nums w-11 flex-shrink-0 text-muted-foreground">
                {a.start_time ? a.start_time.slice(0, 5) : '—'}
              </span>
              <ActivityIcon type={a.type} size={13} style={{ color: ACTIVITY_COLORS[a.type] }} className="flex-shrink-0" />
              <span className="text-sm flex-1 min-w-0 line-clamp-1">{a.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
