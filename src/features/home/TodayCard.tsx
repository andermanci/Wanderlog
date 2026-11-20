import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BedDouble, Check, CloudRain, Coins, Navigation, Plus, Receipt } from 'lucide-react'
import { ActivityIcon, Button, Empty, Notice, Panel, Progress, Photo } from '@/design'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useDocuments } from '@/lib/queries/documents'
import { destinationHourKey, useTodayWeatherHourly, useTripWeather, weatherIcon } from '@/lib/queries/weather'
import { useDestinationGuides } from '@/lib/queries/guide'
import { displayCover } from '@/lib/queries/itinerary'
import { buildDay, focusEntry, type DayEntry } from '@/lib/today'
import { dayCities, resolveNames } from '@/lib/cities'
import { lodgingByDayMap } from '@/lib/lodging'
import type { DirectionsTarget } from '@/lib/directions'
import type { Activity, ItineraryDay, Trip } from '@/types/database'
import { DirectionsPanel } from '@/features/common/Directions'
import { activityTarget } from '@/features/common/target'
import { FlightStatusCard } from '@/features/common/FlightStatusCard'
import { TodayAudioguideRow } from '@/features/guide/TodayAudioguideRow'
import { TodayTickets } from '@/features/wallet/TodayTickets'
import { CurrencyConverter } from '@/features/money/Currency'
import { TIMELINE, TIMELINE_GRID } from '@/features/plan/timeline'
import { DestinationFacts } from './DestinationFacts'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

/**
 * El día de hoy, con el viaje en curso: qué tienes ahora, cómo sigue la jornada,
 * dónde duermes y qué necesitas a mano. Solo se pinta si hoy es un día del viaje.
 */
export function TodayCard({ trip, activities, days }: {
  trip: Trip
  activities: Activity[] | undefined
  days: ItineraryDay[] | undefined
}) {
  const { data: weather } = useTripWeather(trip, days, activities)
  const { data: hourly } = useTodayWeatherHourly(trip, days, activities)
  const { data: guides } = useDestinationGuides(trip.id)
  const { data: documents } = useDocuments(trip.id)
  const { profile } = useAuthStore()
  const [directionsTo, setDirectionsTo] = useState<DirectionsTarget | null>(null)
  const [converterOpen, setConverterOpen] = useState(false)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDay = days?.find(d => d.date === todayStr)

  const todayActs = useMemo(() => {
    if (!todayDay) return []
    return (activities ?? [])
      .filter(a => a.day_id === todayDay.id && a.type !== 'hotel')
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
  }, [activities, todayDay])

  // Se recalcula en cada render; con el minuto que cambia basta.
  const entries = useMemo(() => {
    const now = new Date()
    return buildDay(todayActs, now.getHours() * 60 + now.getMinutes())
  }, [todayActs])
  const focus = focusEntry(entries)

  const lodging = todayDay ? lodgingByDayMap(activities, days).get(todayDay.id)?.[0] : undefined
  const lodgingActivity = lodging && lodging.role !== 'out' ? lodging.activity : null
  const w = weather?.[todayStr]

  // Vuelo de hoy: el retraso y la puerta son lo primero que quieres saber. Se
  // busca por la reserva vinculada, que es la que guarda el número de vuelo.
  const todayFlightNumber = useMemo(() => {
    const flightIds = new Set(todayActs.filter(a => a.type === 'flight').map(a => a.id))
    if (!flightIds.size) return null
    return (documents ?? []).find(d => d.activity_id && flightIds.has(d.activity_id) && d.flight_number)?.flight_number ?? null
  }, [documents, todayActs])

  // Próximas horas (en hora local del DESTINO, como las sirve Open-Meteo).
  const upcomingHours = useMemo(() => {
    if (!hourly) return []
    const nowKey = destinationHourKey(hourly.timezone)
    return hourly.hours.filter(h => h.time >= nowKey).slice(0, 8)
  }, [hourly])
  const rainAt = upcomingHours.find(h => h.precipProb >= 50)
  const showRainRow = upcomingHours.some(h => h.precipProb >= 30)

  // Dónde estás hoy: puede ser más de una ciudad. Va aquí abajo y no junto a
  // todayDay porque el compilador de React da por hecho que pasar el día a una
  // función podría mutarlo y deja de memoizar los useMemo de más arriba.
  const todayCities = resolveNames(dayCities(todayDay), guides)
  const todayWhere = todayCities.map(c => c.name).join(' · ')
  const todayGuide = guides?.find(g => todayCities.some(c => c.guide_id === g.id))
  const facts = todayGuide?.facts ?? guides?.find(g => g.facts && Object.values(g.facts).some(Boolean))?.facts

  // La hora del destino solo importa cuando no es la tuya.
  const tzDiffers = !!hourly && hourly.utcOffsetSeconds !== -new Date().getTimezoneOffset() * 60
  const thereTime = tzDiffers
    ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: hourly!.timezone }).format(new Date())
    : null

  if (!todayDay) return null
  const dayNumber = (days ?? []).findIndex(d => d.id === todayDay.id) + 1

  return (
    <section aria-label="Hoy" className="space-y-6">
      <header className="flex items-end justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="eyebrow text-accent-foreground">Hoy{dayNumber ? ` · día ${dayNumber} de ${days?.length}` : ''}</p>
          <h2 className="title-hero first-letter:uppercase">{format(parseISO(todayStr), "EEEE d", { locale: es })}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {todayWhere && (todayGuide
              ? <Link to={`/trips/${trip.id}/guide`} className="font-medium text-accent-foreground underline-offset-4 hover:underline">{todayWhere}</Link>
              : <span className="font-medium text-foreground">{todayWhere}</span>)}
            {thereTime && <span>Allí son las <span className="font-medium tabular-nums text-foreground">{thereTime}</span></span>}
          </p>
        </div>
        {w && (
          <div className="flex shrink-0 items-center gap-2" aria-label={`Tiempo de hoy: máxima ${w.tmax} grados, mínima ${w.tmin}`}>
            <span className="text-4xl leading-none" aria-hidden="true">{weatherIcon(w.code)}</span>
            <span className="leading-tight">
              <span className="block font-serif text-2xl font-medium tabular-nums">{w.tmax}°</span>
              <span className="block text-sm tabular-nums text-muted-foreground">mín. {w.tmin}°</span>
            </span>
          </div>
        )}
      </header>

      {rainAt && (
        <Notice tone="info" icon={CloudRain}>Lluvia probable ({rainAt.precipProb} %) hacia las {rainAt.time.slice(11, 13)} h.</Notice>
      )}

      {/* Próximas horas: contexto, no debe competir con el plan. Sangrado hasta
          el borde para que la columna que sobra se lea como «hay más, desliza». */}
      {upcomingHours.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          {upcomingHours.map(h => (
            <div key={h.time} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
              <span className="text-2xs tabular-nums text-muted-foreground">{h.time.slice(11, 13)} h</span>
              <span className="text-lg leading-none" aria-hidden="true">{weatherIcon(h.code)}</span>
              <span className="text-xs font-medium tabular-nums">{h.temp}°</span>
              {showRainRow && (
                <span className={cn('text-2xs tabular-nums', h.precipProb >= 30 ? 'text-info' : 'invisible')}>{h.precipProb} %</span>
              )}
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 || lodgingActivity ? (
        <Timeline
          tripId={trip.id} entries={entries} focusId={focus?.activity.id ?? null}
          lodging={lodgingActivity} onDirections={setDirectionsTo}
        />
      ) : (
        <Empty bare icon={Plus} title="Hoy no tienes nada planeado" description="Añade algo al plan de hoy, o disfruta del día libre." className="py-4">
          <Button variant="primary" asChild><Link to={`/trips/${trip.id}/itinerary/new?day=${todayDay.id}`}><Plus /> Añadir un plan</Link></Button>
        </Empty>
      )}

      {/* Justo debajo del plan: lo que toca escuchar ahora. */}
      <TodayAudioguideRow tripId={trip.id} todayDay={todayDay} focus={focus} />

      {todayFlightNumber && <FlightStatusCard flightNumber={todayFlightNumber} date={todayStr} />}

      {/* Billetes, reservas y adjuntos que se necesitan hoy */}
      <TodayTickets tripId={trip.id} todayStr={todayStr} todayActs={todayActs} lodgingActivityId={lodgingActivity?.id} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to={`/trips/${trip.id}/expenses?nuevo=1`}><Receipt /> Apuntar un gasto</Link></Button>
        <Button variant="outline" onClick={() => setConverterOpen(true)}><Coins /> Conversor de moneda</Button>
      </div>

      <DestinationFacts facts={facts} placeName={todayGuide?.name} />

      <DirectionsPanel target={directionsTo} onClose={() => setDirectionsTo(null)} />
      <Panel open={converterOpen} onOpenChange={setConverterOpen} title="Conversor de moneda">
        <CurrencyConverter
          defaultFrom={trip.default_currency || profile?.default_currency || 'EUR'}
          defaultTo={profile?.default_currency ?? 'EUR'}
        />
      </Panel>
    </section>
  )
}

/** El día como un solo hilo, con la misma línea de tiempo que el Plan y una parada destacada: la de ahora. */
function Timeline({ tripId, entries, focusId, lodging, onDirections }: {
  tripId: string
  entries: DayEntry[]
  focusId: string | null
  /** Dónde duermes: cierra el día como última parada. */
  lodging?: Activity | null
  onDirections: (t: DirectionsTarget) => void
}) {
  const dot = (cls: string) => (
    <span className="flex justify-center pt-3.5">
      <span className={cn('rounded-full ring-4 ring-background', cls)} />
    </span>
  )
  return (
    <ol className={TIMELINE}>
      {entries.map(({ activity: a, state, relative, progress }) => {
        const focused = a.id === focusId
        return (
          <li key={a.id} data-tone={a.type} className={cn(TIMELINE_GRID, 'py-1')}>
            <span className={cn('pr-1 pt-2.5 text-right text-sm tabular-nums', focused ? 'font-semibold' : state === 'past' ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
              {hhmm(a.start_time) ?? ''}
            </span>
            {focused
              ? (
                <span className="flex justify-center pt-1.5">
                  <span className="block rounded-full bg-background ring-4 ring-background">
                    <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground md:size-10">
                      <ActivityIcon type={a.type} className="size-[1.125rem] md:size-5" />
                    </span>
                  </span>
                </span>
              )
              : dot(state === 'past' ? 'size-2.5 bg-border-strong' : 'size-2.5 bg-tone')}
            <div className="min-w-0">
              {focused
                ? <FocusStop tripId={tripId} activity={a} state={state} relative={relative} progress={progress} onDirections={onDirections} />
                : (
                  <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-secondary">
                    <span className={cn('min-w-0 flex-1 truncate font-serif text-base', (a.done || state === 'past') && 'text-muted-foreground', a.done && 'line-through')}>
                      {a.title}
                    </span>
                    {a.done && <Check className="size-4 shrink-0 text-success" aria-label="Hecho" />}
                  </Link>
                )}
            </div>
          </li>
        )
      })}
      {lodging && (
        <li data-tone="hotel" className={cn(TIMELINE_GRID, 'py-1')}>
          <span />
          <span className="flex justify-center pt-1">
            <span className="block rounded-full bg-background ring-4 ring-background">
              <span className="grid size-9 place-items-center rounded-full bg-tone-soft text-tone md:size-10"><BedDouble className="size-[1.125rem]" aria-hidden="true" /></span>
            </span>
          </span>
          <Link to={`/trips/${tripId}/itinerary/${lodging.id}`} className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg px-2 transition-colors hover:bg-secondary">
            <span className="text-xs text-muted-foreground">Esta noche duermes en</span>
            <span className="truncate font-serif text-base font-medium">{lodging.title}</span>
          </Link>
        </li>
      )}
    </ol>
  )
}

/** La parada destacada: lleva la cuenta atrás («¿cuánto me queda aquí?») y lo que va transcurrido. */
function FocusStop({ tripId, activity: a, state, relative, progress, onDirections }: {
  tripId: string
  activity: Activity
  state: DayEntry['state']
  relative: string
  progress: number | null
  onDirections: (t: DirectionsTarget) => void
}) {
  const cover = displayCover(a.cover_image_url)
  const label = state === 'current' ? 'Ahora' : state === 'upcoming' ? 'A continuación' : 'Lo último de hoy'
  const target = activityTarget(a)
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-raised">
      <Photo src={cover} alt="" className="h-36 w-full object-cover" />
      <div className="p-4">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="eyebrow text-accent-foreground">{label}</span>
          {relative && <span className="text-sm font-medium">{relative}</span>}
        </p>
        <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="mt-1 block">
          <span className="font-serif text-2xl font-medium leading-tight tracking-tight line-clamp-2">{a.title}</span>
          {a.start_time && (
            <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
              {a.start_time.slice(0, 5)}{a.end_time && ` – ${a.end_time.slice(0, 5)}`}
            </span>
          )}
        </Link>
        {progress != null && <Progress value={progress * 100} label="Tiempo transcurrido" className="mt-3" />}
        {target && (
          <Button variant="primary" size="sm" className="mt-3.5" onClick={() => onDirections(target)}>
            <Navigation /> Cómo llegar
          </Button>
        )}
      </div>
    </div>
  )
}
