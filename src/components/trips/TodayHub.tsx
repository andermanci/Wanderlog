import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, BedDouble, Receipt, Map as MapIcon, CalendarDays, ChevronRight, BookOpen, Navigation, Coins } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrencyConverter } from '@/components/CurrencyConverter'
import { useAuthStore } from '@/store/authStore'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { DirectionsDialog } from '@/components/DirectionsDialog'
import { UsefulInfoCard } from '@/components/trips/UsefulInfoCard'
import { TodayDocsRow } from '@/components/trips/TodayDocsRow'
import { FlightStatusCard } from '@/components/itinerary/FlightStatusCard'
import { useDocuments } from '@/lib/queries/documents'
import { displayCover } from '@/lib/queries/itinerary'
import { useTripWeather, useTodayWeatherHourly, weatherIcon, destinationHourKey } from '@/lib/queries/weather'
import { useDestinationGuides } from '@/lib/queries/guide'
import { lodgingByDayMap } from '@/lib/lodging'
import type { DirectionsTarget } from '@/lib/directions'
import { ACTIVITY_COLORS } from '@/lib/utils'
import type { Trip, Activity, ItineraryDay } from '@/types/database'

// Destino navegable de una actividad: coords propias, o las de destino/origen
// (transportes), o su dirección en texto. null si no hay nada que navegar.
function activityTarget(a: Activity): DirectionsTarget | null {
  const lat = a.lat ?? a.destination_lat ?? a.origin_lat
  const lng = a.lng ?? a.destination_lng ?? a.origin_lng
  const address = a.address ?? a.destination ?? a.origin
  if (lat == null && !address) return null
  return { name: a.title, lat, lng, address }
}

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
  const { data: hourly } = useTodayWeatherHourly(trip, days, activities)
  const { data: guides } = useDestinationGuides(trip.id)
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)
  const [converterOpen, setConverterOpen] = useState(false)
  const { profile } = useAuthStore()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDay = days?.find(d => d.date === todayStr)
  const todayGuide = todayDay?.guide_id ? guides?.find(g => g.id === todayDay.guide_id) : undefined

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

  // Vuelo de hoy: el día que vuelas, el retraso y la puerta son lo primero que
  // quieres saber. Se busca por la reserva vinculada, que es la que guarda el
  // número de vuelo (documents.flight_number).
  const { data: documents } = useDocuments(trip.id)
  const todayFlightNumber = useMemo(() => {
    const flightIds = new Set(todayActs.filter(a => a.type === 'flight').map(a => a.id))
    if (!flightIds.size) return null
    return (documents ?? []).find(d => d.activity_id && flightIds.has(d.activity_id) && d.flight_number)
      ?.flight_number ?? null
  }, [documents, todayActs])

  // Próximas horas (en hora local del DESTINO, como las sirve Open-Meteo).
  const upcomingHours = useMemo(() => {
    if (!hourly) return []
    const nowKey = destinationHourKey(hourly.timezone)
    return hourly.hours.filter(h => h.time >= nowKey).slice(0, 10)
  }, [hourly])
  const rainAt = upcomingHours.find(h => h.precipProb >= 50)

  // Facts de la guía: la de hoy, o la primera con datos.
  const facts = (todayDay?.guide_id ? guides?.find(g => g.id === todayDay.guide_id)?.facts : undefined)
    ?? guides?.find(g => g.facts && Object.values(g.facts).some(Boolean))?.facts

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

      {/* Próximas horas: aviso de lluvia + mini-franja horaria */}
      {rainAt && (
        <p className="flex items-center gap-1.5 text-xs font-medium mb-2 px-2 py-1 rounded-md w-fit"
          style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>
          🌧 Lluvia probable ({rainAt.precipProb}%) a las {rainAt.time.slice(11, 13)}h
        </p>
      )}
      {upcomingHours.length > 1 && (
        <div className="flex gap-1 overflow-x-auto mb-3 -mx-1 px-1 [scrollbar-width:none]">
          {upcomingHours.map(h => (
            <div key={h.time} className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg flex-shrink-0 surface">
              <span className="text-[10px] text-muted-foreground tabular-nums">{h.time.slice(11, 16)}</span>
              <span className="text-sm leading-none">{weatherIcon(h.code)}</span>
              <span className="text-[11px] font-medium tabular-nums">{h.temp}°</span>
              {h.precipProb >= 30 && (
                <span className="text-[9px] tabular-nums" style={{ color: 'var(--info)' }}>{h.precipProb}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ciudad de hoy (guía del destino) */}
      {todayGuide && (
        <Link to={`/trips/${trip.id}/guide`}
          className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full text-sm transition-colors hover:brightness-105 surface">
          <BookOpen size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-muted-foreground">Hoy en</span>
          <span className="font-medium">{todayGuide.name}</span>
          <ChevronRight size={14} className="text-muted-foreground" />
        </Link>
      )}

      {/* Ahora / A continuación */}
      {featured ? (
        <Link
          to={`/trips/${trip.id}/itinerary/${featured.id}`}
          className="flex items-center gap-3 p-3 rounded-xl mb-3 transition-colors hover:brightness-[1.02] surface"
        >
          {displayCover(featured.cover_image_url) ? (
            <img src={displayCover(featured.cover_image_url)!} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
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
          {activityTarget(featured) && (
            <button
              type="button"
              aria-label="Cómo llegar"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDirectionsTo(activityTarget(featured)) }}
              className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 transition-colors hover:brightness-110"
              style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
            >
              <Navigation size={16} style={{ color: 'var(--primary)' }} />
            </button>
          )}
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground mb-3">No hay actividades planificadas para hoy.</p>
      )}

      {/* Estado del vuelo de hoy (si hoy vuelas y la reserva trae número) */}
      {todayFlightNumber && (
        <div className="mb-3">
          <FlightStatusCard flightNumber={todayFlightNumber} date={todayStr} />
        </div>
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

      {/* Billetes, reservas y adjuntos que se necesitan hoy */}
      <TodayDocsRow
        tripId={trip.id}
        todayStr={todayStr}
        todayActs={todayActs}
        lodgingActivityId={lodging?.activity.id}
      />

      {/* Hora local, emergencias y datos del destino */}
      <UsefulInfoCard hourly={hourly} facts={facts} />

      {/* Accesos rápidos */}
      <div className="grid grid-cols-4 gap-2">
        <Link to={`/trips/${trip.id}/itinerary?day=${todayStr}`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary surface">
          <CalendarDays size={16} style={{ color: 'var(--primary)' }} /> Itinerario
        </Link>
        <Link to={`/trips/${trip.id}/map`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary surface">
          <MapIcon size={16} style={{ color: 'var(--primary)' }} /> Mapa
        </Link>
        <Link to={`/trips/${trip.id}/expenses`}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary surface">
          <Receipt size={16} style={{ color: 'var(--primary)' }} /> Gasto
        </Link>
        <button type="button" onClick={() => setConverterOpen(true)}
          className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary surface">
          <Coins size={16} style={{ color: 'var(--primary)' }} /> Divisas
        </button>
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

      <DirectionsDialog target={directionsTo} onClose={() => setDirectionsTo(null)} />

      <Dialog open={converterOpen} onOpenChange={setConverterOpen}>
        <DialogContent className="surface">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Coins size={18} style={{ color: 'var(--primary)' }} /> Conversor de divisas
            </DialogTitle>
          </DialogHeader>
          <CurrencyConverter
            defaultFrom={trip.default_currency || profile?.default_currency || 'EUR'}
            defaultTo={profile?.default_currency ?? 'EUR'}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
