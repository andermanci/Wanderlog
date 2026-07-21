import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Receipt, Map as MapIcon, CalendarDays, ChevronRight, Clock3, Coins, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrencyConverter } from '@/components/CurrencyConverter'
import { useAuthStore } from '@/store/authStore'
import { DirectionsDialog } from '@/components/DirectionsDialog'
import { DestinationFacts } from '@/components/trips/DestinationFacts'
import { TodayDocsRow } from '@/components/trips/TodayDocsRow'
import { TodayTimeline } from '@/components/trips/TodayTimeline'
import { FlightStatusCard } from '@/components/itinerary/FlightStatusCard'
import { useDocuments } from '@/lib/queries/documents'
import { useTripWeather, useTodayWeatherHourly, weatherIcon, destinationHourKey } from '@/lib/queries/weather'
import { useDestinationGuides } from '@/lib/queries/guide'
import { buildDay, focusEntry } from '@/lib/today'
import { dayCities, resolveNames } from '@/lib/cities'
import { lodgingByDayMap } from '@/lib/lodging'
import type { DirectionsTarget } from '@/lib/directions'
import type { Trip, Activity, ItineraryDay } from '@/types/database'

// Fondo de la tarjeta. Se expone además como variable para que los puntos del
// hilo del día puedan "perforar" la línea con un halo del mismo color.
const HUB_BG = 'color-mix(in srgb, var(--primary) 7%, var(--card))'

// Destino navegable de una actividad: coords propias, o las de destino/origen
// (transportes), o su dirección en texto. null si no hay nada que navegar.
function activityTarget(a: Activity): DirectionsTarget | null {
  const lat = a.lat ?? a.destination_lat ?? a.origin_lat
  const lng = a.lng ?? a.destination_lng ?? a.origin_lng
  const address = a.address ?? a.destination ?? a.origin
  if (lat == null && !address) return null
  return { name: a.title, lat, lng, address }
}

// Centro del día: qué tienes ahora, cómo va el resto de la jornada, dónde
// duermes y qué necesitas a mano. Solo se muestra con el viaje en curso (lo
// decide TripDetail).
export function TodayHub({ trip, activities, days }: {
  trip: Trip
  activities: Activity[] | undefined
  days: ItineraryDay[] | undefined
}) {
  const { data: weather } = useTripWeather(trip, days, activities)
  const { data: hourly } = useTodayWeatherHourly(trip, days, activities)
  const { data: guides } = useDestinationGuides(trip.id)
  const { data: documents } = useDocuments(trip.id)
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)
  const [converterOpen, setConverterOpen] = useState(false)
  const { profile } = useAuthStore()

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDay = days?.find(d => d.date === todayStr)

  const todayActs = useMemo(() => {
    if (!todayDay) return []
    return (activities ?? [])
      .filter(a => a.day_id === todayDay.id && a.type !== 'hotel')
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
  }, [activities, todayDay])

  // Se recalcula en cada render; con el minuto que cambia basta, y la tarjeta
  // se vuelve a pintar de sobra al navegar o al refrescarse cualquier query.
  const entries = useMemo(() => {
    const now = new Date()
    return buildDay(todayActs, now.getHours() * 60 + now.getMinutes())
  }, [todayActs])
  const focus = focusEntry(entries)

  const lodging = todayDay ? lodgingByDayMap(activities, days).get(todayDay.id)?.[0] : undefined
  const lodgingActivity = lodging && lodging.role !== 'out' ? lodging.activity : null
  const w = weather?.[todayStr]

  // Vuelo de hoy: el día que vuelas, el retraso y la puerta son lo primero que
  // quieres saber. Se busca por la reserva vinculada, que es la que guarda el
  // número de vuelo (documents.flight_number).
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
    return hourly.hours.filter(h => h.time >= nowKey).slice(0, 8)
  }, [hourly])
  const rainAt = upcomingHours.find(h => h.precipProb >= 50)
  const showRainRow = upcomingHours.some(h => h.precipProb >= 30)

  // Dónde estás hoy: puede ser más de una ciudad ("Roma · Tívoli"). La guía que
  // se abre es la de la primera que la tenga. Va aquí abajo, y no junto a
  // todayDay, porque el compilador de React da por hecho que pasar el día a una
  // función podría mutarlo y deja de memoizar los useMemo de más arriba.
  const todayCities = resolveNames(dayCities(todayDay), guides)
  const todayWhere = todayCities.map(c => c.name).join(' · ')
  const todayGuide = guides?.find(g => todayCities.some(c => c.guide_id === g.id))

  // Facts de la guía: la de hoy, o la primera con datos.
  const facts = todayGuide?.facts
    ?? guides?.find(g => g.facts && Object.values(g.facts).some(Boolean))?.facts

  // La hora del destino solo importa cuando no es la tuya.
  const tzDiffers = !!hourly && hourly.utcOffsetSeconds !== -new Date().getTimezoneOffset() * 60
  const thereTime = tzDiffers
    ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: hourly!.timezone }).format(new Date())
    : null

  if (!todayDay) return null

  return (
    <section
      aria-label="Hoy"
      className="rounded-2xl p-4 sm:p-5"
      style={{
        background: HUB_BG,
        border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
        '--hub-bg': HUB_BG,
      } as React.CSSProperties}
    >
      {/* Cabecera: el "cuándo y dónde" en dos líneas, para que el plan empiece
          cuanto antes. Fecha, ciudad y hora local iban antes en tres bloques
          separados repartidos por toda la tarjeta. */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-medium leading-none">Hoy</h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground mt-1.5">
            {/* first-letter en vez de capitalize: en español solo va en mayúscula
                la primera palabra ("martes, 21 de julio", no "Martes 21 De Julio"). */}
            <span className="first-letter:uppercase">
              {format(parseISO(todayStr), "EEEE, d 'de' MMMM", { locale: es })}
            </span>
            {todayWhere && (
              <>
                <span aria-hidden="true" className="opacity-40">·</span>
                {todayGuide ? (
                  <Link to={`/trips/${trip.id}/guide`}
                    className="inline-flex items-center gap-0.5 font-medium transition-opacity hover:opacity-80"
                    style={{ color: 'var(--primary)' }}>
                    {todayWhere}
                    <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="font-medium">{todayWhere}</span>
                )}
              </>
            )}
            {thereTime && (
              <>
                <span aria-hidden="true" className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={11} aria-hidden="true" />
                  <span className="tabular-nums">{thereTime}</span> allí
                </span>
              </>
            )}
          </p>
        </div>

        {w && (
          <span className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
            <span className="text-xl leading-none" aria-hidden="true">{weatherIcon(w.code)}</span>
            <span className="text-lg font-medium tabular-nums leading-none">{w.tmax}°</span>
            <span className="text-xs text-muted-foreground tabular-nums leading-none">{w.tmin}°</span>
          </span>
        )}
      </header>

      {rainAt && (
        <p className="flex items-center gap-1.5 text-xs font-medium mb-3 px-2 py-1 rounded-md w-fit"
          style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>
          🌧 Lluvia probable ({rainAt.precipProb}%) a las {rainAt.time.slice(11, 13)}h
        </p>
      )}

      {/* Franja horaria sin cajas: es contexto, no debe competir con el plan.
          Va sangrada hasta el borde de la tarjeta para que la columna que sobra
          se corte contra el canto y se lea como "hay más, desliza", en vez de
          parecer un recorte a media hora en mitad del contenido. */}
      {upcomingHours.length > 1 && (
        <div className="flex gap-1 overflow-x-auto mb-3 -mx-4 px-4 sm:-mx-5 sm:px-5 [scrollbar-width:none]">
          {upcomingHours.map(h => (
            <div key={h.time} className="flex flex-col items-center gap-0.5 flex-shrink-0 w-10">
              <span className="text-[10px] text-muted-foreground tabular-nums">{h.time.slice(11, 13)}h</span>
              <span className="text-sm leading-none" aria-hidden="true">{weatherIcon(h.code)}</span>
              <span className="text-[11px] font-medium tabular-nums">{h.temp}°</span>
              {/* La fila de lluvia solo existe si va a llover en alguna de estas
                  horas; si no, era una franja de huecos vacíos en todas. Dentro
                  de la franja sí se reserva, para que no bailen las columnas. */}
              {showRainRow && (
                <span className="text-[9px] tabular-nums leading-none"
                  style={{ color: h.precipProb >= 30 ? 'var(--info)' : 'transparent' }}>
                  {h.precipProb}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* El día, de una pieza */}
      {entries.length > 0 || lodgingActivity ? (
        <TodayTimeline
          tripId={trip.id}
          entries={entries}
          focusId={focus?.activity.id ?? null}
          lodging={lodgingActivity}
          onDirections={setDirectionsTo}
          targetOf={activityTarget}
        />
      ) : (
        <Link to={`/trips/${trip.id}/itinerary/new`}
          className="flex items-center gap-3 p-3 rounded-xl mb-4 border border-dashed border-border transition-colors hover:border-primary">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
            <Plus size={17} style={{ color: 'var(--primary)' }} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">Hoy no tienes nada planificado</span>
            <span className="block text-xs text-muted-foreground">Añade un plan al itinerario</span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
        </Link>
      )}

      {todayFlightNumber && (
        <div className="mb-4">
          <FlightStatusCard flightNumber={todayFlightNumber} date={todayStr} />
        </div>
      )}

      {/* Billetes, reservas y adjuntos que se necesitan hoy */}
      <TodayDocsRow
        tripId={trip.id}
        todayStr={todayStr}
        todayActs={todayActs}
        lodgingActivityId={lodgingActivity?.id}
      />

      {/* Accesos rápidos: son navegación, no contenido, así que van planos y
          por debajo del plan en peso visual. */}
      <div className="grid grid-cols-4 gap-1.5">
        <QuickAction to={`/trips/${trip.id}/itinerary?day=${todayStr}`} icon={CalendarDays} label="Itinerario" />
        <QuickAction to={`/trips/${trip.id}/map`} icon={MapIcon} label="Mapa" />
        <QuickAction to={`/trips/${trip.id}/expenses`} icon={Receipt} label="Gasto" />
        <QuickAction icon={Coins} label="Divisas" onClick={() => setConverterOpen(true)} />
      </div>

      {/* Moneda, enchufe, idioma, emergencias: se consultan una vez por viaje,
          así que van al final y plegados. */}
      <DestinationFacts facts={facts} placeName={todayGuide?.name} />

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
    </section>
  )
}

function QuickAction({ to, icon: Icon, label, onClick }: {
  to?: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  label: string
  onClick?: () => void
}) {
  const cls = 'flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-colors hover:brightness-95'
  const style = { background: 'var(--secondary)' }
  const inner = (
    <>
      <Icon size={16} style={{ color: 'var(--primary)' }} />
      {label}
    </>
  )
  return to
    ? <Link to={to} className={cls} style={style}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls} style={style}>{inner}</button>
}
