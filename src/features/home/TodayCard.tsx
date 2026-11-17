import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BedDouble, Check, CloudRain, Coins, Navigation, Plus, Receipt } from 'lucide-react'
import { ActivityIcon, Button, Card, Empty, Notice, Panel, Progress } from '@/design'
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

  return (
    <Card pad="lg" className="space-y-5 border-primary/25 bg-primary-soft/40">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-accent-foreground">Hoy</p>
          <h2 className="title-page first-letter:uppercase">{format(parseISO(todayStr), "EEEE d 'de' MMMM", { locale: es })}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {todayWhere && (todayGuide
              ? <Link to={`/trips/${trip.id}/guide`} className="font-medium text-accent-foreground underline-offset-4 hover:underline">{todayWhere}</Link>
              : <span className="font-medium text-foreground">{todayWhere}</span>)}
            {thereTime && <span>Allí son las <span className="font-medium tabular-nums text-foreground">{thereTime}</span></span>}
          </p>
        </div>
        {w && (
          <div className="shrink-0 text-right" aria-label={`Tiempo de hoy: máxima ${w.tmax} grados, mínima ${w.tmin}`}>
            <p className="text-3xl leading-none" aria-hidden="true">{weatherIcon(w.code)}</p>
            <p className="mt-1 text-sm tabular-nums"><span className="font-semibold">{w.tmax}°</span> <span className="text-muted-foreground">{w.tmin}°</span></p>
          </div>
        )}
      </header>

      {rainAt && (
        <Notice tone="info" icon={CloudRain}>Lluvia probable ({rainAt.precipProb} %) hacia las {rainAt.time.slice(11, 13)} h.</Notice>
      )}

      {/* Próximas horas: contexto, no debe competir con el plan. Sangrado hasta
          el borde para que la columna que sobra se lea como «hay más, desliza». */}
      {upcomingHours.length > 1 && (
        <div className="no-scrollbar -mx-6 flex gap-1 overflow-x-auto px-6 md:-mx-7 md:px-7">
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
    </Card>
  )
}

/** El día como un solo hilo cronológico, con una parada destacada: la de ahora. */
function Timeline({ tripId, entries, focusId, lodging, onDirections }: {
  tripId: string
  entries: DayEntry[]
  focusId: string | null
  /** Dónde duermes: cierra el día como última parada. */
  lodging?: Activity | null
  onDirections: (t: DirectionsTarget) => void
}) {
  return (
    <ol className="relative">
      {/* La línea del día */}
      <span aria-hidden="true" className="absolute bottom-3 left-[3.6rem] top-3 w-px bg-border-strong" />
      {entries.map(({ activity: a, state, relative, progress }) => {
        const focused = a.id === focusId
        return (
          <li key={a.id} className="relative flex gap-3 py-1.5">
            <span className={cn('w-11 shrink-0 pt-2.5 text-right text-xs tabular-nums', state === 'past' ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
              {hhmm(a.start_time) ?? ''}
            </span>
            <span aria-hidden="true" className="relative z-10 mt-3 flex w-4 shrink-0 justify-center">
              <span className={cn(
                'rounded-full ring-4 ring-card',
                focused ? 'size-3.5 bg-primary' : state === 'past' ? 'size-2.5 bg-border-strong' : 'size-2.5 bg-muted-foreground',
              )} />
            </span>
            <div className="min-w-0 flex-1">
              {focused
                ? <FocusStop tripId={tripId} activity={a} state={state} relative={relative} progress={progress} onDirections={onDirections} />
                : (
                  <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-card">
                    <span data-tone={a.type} className="text-tone"><ActivityIcon type={a.type} className="size-4.5" /></span>
                    <span className={cn('min-w-0 flex-1 truncate text-[0.9375rem]', (a.done || state === 'past') && 'text-muted-foreground', a.done && 'line-through')}>
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
        <li className="relative flex gap-3 py-1.5">
          <span className="w-11 shrink-0" />
          <span aria-hidden="true" className="relative z-10 mt-3 flex w-4 shrink-0 justify-center">
            <span className="size-2.5 rounded-full bg-border-strong ring-4 ring-card" />
          </span>
          <Link to={`/trips/${tripId}/itinerary/${lodging.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-card">
            <span data-tone="hotel" className="text-tone"><BedDouble className="size-4.5" aria-hidden="true" /></span>
            <span className="shrink-0 text-sm text-muted-foreground">Esta noche</span>
            <span className="truncate text-[0.9375rem] font-medium">{lodging.title}</span>
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
    <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-card">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="eyebrow text-accent-foreground">{label}</span>
        {relative && <span className="text-sm text-muted-foreground">{relative}</span>}
      </p>
      <Link to={`/trips/${tripId}/itinerary/${a.id}`} className="mt-2 flex items-center gap-3">
        {cover
          ? <img src={cover} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          : (
            <span data-tone={a.type} className="grid size-14 shrink-0 place-items-center rounded-xl bg-tone-soft text-tone">
              <ActivityIcon type={a.type} className="size-6" />
            </span>
          )}
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-snug line-clamp-2">{a.title}</span>
          {a.start_time && (
            <span className="mt-0.5 block text-sm tabular-nums text-muted-foreground">
              {a.start_time.slice(0, 5)}{a.end_time && ` – ${a.end_time.slice(0, 5)}`}
            </span>
          )}
        </span>
      </Link>
      {progress != null && <Progress value={progress * 100} label="Tiempo transcurrido" className="mt-3" />}
      {target && (
        <Button variant="soft" size="sm" className="mt-3" onClick={() => onDirections(target)}>
          <Navigation /> Cómo llegar
        </Button>
      )}
    </div>
  )
}
