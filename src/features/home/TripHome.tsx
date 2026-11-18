import { Link, useParams } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle, Bell, BookHeart, CalendarDays, CalendarRange, CheckCircle2, Circle, Clock, Heart, Luggage,
  MapPin, Pencil, Plus, Receipt, Settings, Share2, Sparkles, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import {
  ActivityIcon, Badge, Button, Card, Empty, Page, Progress, Row, RowList, Section, Skeleton, Stack, type Tone,
} from '@/design'
import { useTrip } from '@/lib/queries/trips'
import { useExpenses } from '@/lib/queries/expenses'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { usePackingItems } from '@/lib/queries/packing'
import { useDocuments } from '@/lib/queries/documents'
import { useReminders } from '@/lib/queries/reminders'
import { sumConverted, useExchangeRates } from '@/lib/queries/rates'
import { canEditRole, canShareRole, useTripRole } from '@/lib/queries/sharing'
import { useAuthStore } from '@/store/authStore'
import {
  cn, effectiveStatus, formatCurrency, formatDate, PERSONAL_DOC_CATEGORIES, STATUS_LABELS, sumByCurrency,
} from '@/lib/utils'
import { fallbackCover } from '@/lib/coverFallbacks'
import { useUiStore } from '@/shell/uiStore'
import { dateRange } from '@/features/trips/copy'
import { OfflineCard } from '@/features/trips/OfflineCard'
import { TodayCard } from './TodayCard'

/** Inicio del viaje: «¿qué toca ahora?». Cambia según el viaje esté por venir, en curso o terminado. */
export function TripHome() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId)
  const { data: expenses } = useExpenses(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: days } = useItineraryDays(tripId)
  const { data: packing } = usePackingItems(tripId)
  const { data: documents } = useDocuments(tripId)
  const { data: reminders } = useReminders(tripId)
  const { data: role } = useTripRole(tripId)
  const { user, profile } = useAuthStore()
  const openShare = useUiStore(s => s.openShare)
  const openTripForm = useUiStore(s => s.openTripForm)

  const mainCurrency = profile?.default_currency ?? 'EUR'
  const { data: rates } = useExchangeRates(mainCurrency)
  const spent = sumConverted(expenses ?? [], mainCurrency, rates).total
  const otherTotals = Object.entries(sumByCurrency(expenses ?? [])).filter(([c]) => c !== mainCurrency)
  const budget = trip?.budget_total ?? 0

  if (isLoading) {
    return (
      <Page width="wide">
        <Stack>
          <Skeleton className="h-64 rounded-3xl md:h-80" />
          <Skeleton className="h-40 rounded-2xl" />
        </Stack>
      </Page>
    )
  }
  if (!trip) {
    return (
      <Page>
        <Empty icon={MapPin} title="No encontramos este viaje" description="Puede que se haya borrado o que ya no tengas acceso.">
          <Button variant="primary" asChild><Link to="/dashboard">Ver mis viajes</Link></Button>
        </Empty>
      </Page>
    )
  }

  const canEdit = canEditRole(role)
  const isOwner = trip.user_id === user?.id
  const status = effectiveStatus(trip)
  const phase: 'pre' | 'now' | 'past' = status === 'in_progress' ? 'now' : status === 'completed' ? 'past' : 'pre'

  // Días naturales que faltan (mañana = 1), no periodos de 24 horas.
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(trip.start_date), new Date()))

  // Lo siguiente que harás (de hoy en adelante).
  const dayDate = new Map((days ?? []).map(d => [d.id, d.date]))
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const next = (activities ?? [])
    .map(a => ({ a, date: dayDate.get(a.day_id) ?? '' }))
    .filter(x => x.date && x.date >= todayStr)
    .sort((x, y) => x.date !== y.date ? x.date.localeCompare(y.date) : x.a.order_index - y.a.order_index)[0]

  // Preparativos
  const totalDays = days?.length ?? 0
  const plannedDayIds = new Set((activities ?? []).map(a => a.day_id))
  const plannedDays = (days ?? []).filter(d => plannedDayIds.has(d.id)).length
  const actCount = activities?.length ?? 0
  const packingTotal = packing?.length ?? 0
  const packingDone = packing?.filter(p => p.is_checked).length ?? 0
  const packingPct = packingTotal > 0 ? Math.round((packingDone / packingTotal) * 100) : 0
  const docCount = documents?.length ?? 0
  const hasId = (documents ?? []).some(d => PERSONAL_DOC_CATEGORIES.includes(d.category))
  const pendingReminders = (reminders ?? []).filter(r => !r.is_sent && r.remind_at >= new Date().toISOString()).length

  const prep: { to: string; icon: LucideIcon; label: string; value: string; done: boolean; warn?: string }[] = [
    {
      to: `/trips/${tripId}/itinerary`, icon: CalendarRange, label: 'Plan', done: actCount > 0,
      value: actCount > 0 ? `${actCount} ${actCount === 1 ? 'actividad' : 'actividades'} · ${plannedDays} de ${totalDays} días con plan` : 'Aún no has planeado nada',
    },
    {
      to: `/trips/${tripId}/documents`, icon: Wallet, label: 'Billetes y documentos', done: docCount > 0 && hasId,
      value: docCount > 0 ? `${docCount} ${docCount === 1 ? 'guardado' : 'guardados'}` : 'Aún no has guardado ninguno',
      warn: !hasId ? 'Falta tu DNI o pasaporte' : undefined,
    },
    {
      to: `/trips/${tripId}/packing`, icon: Luggage, label: 'Equipaje', done: packingTotal > 0 && packingPct === 100,
      value: packingTotal > 0 ? `${packingDone} de ${packingTotal} cosas en la maleta` : 'Aún no tienes lista',
    },
  ]
  const prepDone = prep.filter(p => p.done).length

  const extras: { to: string; icon: LucideIcon; tone: Tone; label: string; value: string }[] = [
    { to: `/trips/${tripId}/packing`, icon: Luggage, tone: 'hotel', label: 'Equipaje', value: packingTotal > 0 ? `${packingPct} % listo` : 'Haz tu lista' },
    { to: `/trips/${tripId}/reminders`, icon: Bell, tone: 'restaurant', label: 'Avisos', value: pendingReminders > 0 ? `${pendingReminders} ${pendingReminders === 1 ? 'pendiente' : 'pendientes'}` : 'Ninguno pendiente' },
    { to: `/trips/${tripId}/itinerary?diario=hoy`, icon: BookHeart, tone: 'place', label: 'Diario', value: 'Apunta cómo va el día' },
    { to: `/trips/${tripId}/memory`, icon: Heart, tone: 'primary', label: 'Recuerdo', value: 'El viaje, para guardar' },
    { to: `/trips/${tripId}/settings`, icon: Settings, tone: 'neutral', label: 'Ajustes', value: 'Moneda, permisos…' },
  ]

  return (
    <Page width="wide">
      <Stack>
        {/* Portada */}
        <div className="relative overflow-hidden rounded-3xl shadow-raised">
          <img src={trip.cover_image_url || fallbackCover(trip.id)} alt="" className="h-64 w-full object-cover md:h-80" />
          <div className="photo-scrim absolute inset-0" />
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {!isOwner && (
              <span className="on-photo inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium">
                <Users className="size-4" aria-hidden="true" /> Compartido contigo
              </span>
            )}
            {/* En escritorio «Compartir» ya está en la barra superior. */}
            {canShareRole(role) && <Button variant="photo" size="sm" className="md:hidden" onClick={() => openShare(tripId)}><Share2 /> Compartir</Button>}
            {canEdit && <Button variant="photo" size="sm" onClick={() => openTripForm(tripId)}><Pencil /> Editar</Button>}
          </div>
          <div className="absolute inset-x-5 bottom-5 text-white md:inset-x-8 md:bottom-7">
            <Badge tone={status as Tone} solid>{STATUS_LABELS[status]}</Badge>
            <h1 className="title-hero mt-2 break-words">{trip.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-white/90">
              <span className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{trip.destination}</span>
              <span className="flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />{dateRange(trip.start_date, trip.end_date, formatDate)}</span>
            </p>
          </div>
        </div>

        {(trip.tags.length > 0 || trip.description) && (
          <div className="space-y-2.5">
            {trip.description && <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">{trip.description}</p>}
            {trip.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trip.tags.map(tag => <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">{tag}</span>)}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {/* Columna principal: lo que toca según la fase */}
          <Stack>
            {phase === 'now' && <TodayCard trip={trip} activities={activities} days={days} />}

            {phase === 'pre' && (
              <>
                {/* La cuenta atrás, protagonista mientras el viaje no ha empezado. */}
                <div className="flex items-end gap-4 border-b border-border pb-5">
                  <p className="font-serif text-7xl font-medium leading-[0.85] tracking-tight tabular-nums text-primary md:text-8xl">
                    {daysLeft}
                  </p>
                  <p className="pb-1">
                    <span className="eyebrow block">Cuenta atrás</span>
                    <span className="title-section block">{daysLeft === 1 ? 'día para salir' : 'días para salir'}</span>
                    <span className="block text-sm text-muted-foreground first-letter:uppercase">Sales el {formatDate(trip.start_date, "EEEE d 'de' MMMM")}</span>
                  </p>
                </div>
                {next ? (
                  <Section title="Lo primero que harás">
                    <RowList>
                      <Row
                        to={`/trips/${tripId}/itinerary/${next.a.id}`}
                        leading={
                          <span data-tone={next.a.type} className="grid size-12 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                            <ActivityIcon type={next.a.type} className="size-5.5" />
                          </span>
                        }
                        title={next.a.title}
                        subtitle={<span className="first-letter:uppercase">{format(new Date(next.date + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}</span>}
                        trailing={next.a.start_time
                          ? <span className="flex items-center gap-1 font-medium tabular-nums text-foreground"><Clock className="size-4" aria-hidden="true" />{next.a.start_time.slice(0, 5)}</span>
                          : undefined}
                        chevron
                      />
                    </RowList>
                  </Section>
                ) : canEdit ? (
                  <Empty icon={Sparkles} title="Empieza a darle forma" description="Añade tu vuelo, el hotel o lo primero que quieras ver. Lo demás irá saliendo.">
                    <Button variant="primary" size="lg" asChild><Link to={`/trips/${tripId}/itinerary/new`}><Plus /> Añadir lo primero</Link></Button>
                  </Empty>
                ) : null}

                <Section title="Preparativos" description={`${prepDone} de ${prep.length} listos`}>
                  <Progress value={(prepDone / prep.length) * 100} tone="success" label="Preparativos listos" />
                  <RowList>
                    {prep.map(p => (
                      <Row
                        key={p.label} to={p.to} chevron
                        leading={p.done
                          ? <CheckCircle2 className="size-7 shrink-0 text-success" aria-label="Listo" />
                          : <Circle className="size-7 shrink-0 text-border-strong" aria-label="Pendiente" />}
                        title={p.label}
                        subtitle={p.value}
                        trailing={p.warn ? <Badge tone="warning" icon={AlertTriangle}>{p.warn}</Badge> : undefined}
                      />
                    ))}
                  </RowList>
                </Section>
              </>
            )}

            {phase === 'past' && (
              <Card pad="lg" className="border-primary/25 bg-primary-soft/40 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-card text-primary shadow-card">
                  <Sparkles className="size-6" aria-hidden="true" />
                </span>
                <h2 className="title-page mt-4">Viaje completado</h2>
                <p className="mt-1 text-[0.9375rem] text-muted-foreground">
                  {totalDays || '—'} días · {actCount} {actCount === 1 ? 'actividad' : 'actividades'}
                  {spent > 0 && ` · ${formatCurrency(spent, mainCurrency)} gastados`}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" asChild><Link to={`/trips/${tripId}/memory`}><Heart /> Ver el recuerdo</Link></Button>
                  <Button variant="outline" asChild><Link to={`/trips/${tripId}/expenses`}><Receipt /> Ver los gastos</Link></Button>
                </div>
              </Card>
            )}
          </Stack>

          {/* Columna lateral: lo que siempre está */}
          <Stack>
            {budget > 0 && (
              <Card interactive asChild>
                <Link to={`/trips/${tripId}/expenses`}>
                  <p className="eyebrow">Presupuesto</p>
                  <p className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums tracking-tight">{formatCurrency(spent, mainCurrency)}</span>
                    <span className="text-sm text-muted-foreground">de {formatCurrency(budget, mainCurrency)}</span>
                  </p>
                  <Progress value={(spent / budget) * 100} tone={spent > budget ? 'danger' : 'primary'} label="Presupuesto gastado" className="mt-3" />
                  <p className={cn('mt-2 text-sm', spent > budget ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {spent > budget
                      ? `Te has pasado ${formatCurrency(spent - budget, mainCurrency)}`
                      : `Te quedan ${formatCurrency(budget - spent, mainCurrency)}`}
                  </p>
                  {otherTotals.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">En otras monedas: {otherTotals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}</p>
                  )}
                </Link>
              </Card>
            )}

            <Section title="Más del viaje">
              <div className="grid grid-cols-2 gap-3">
                {extras.map(e => (
                  <Link
                    key={e.label} to={e.to} data-tone={e.tone}
                    className="flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-card transition-[box-shadow,border-color,transform] duration-200 last:odd:col-span-2 hover:-translate-y-0.5 hover:border-tone-line hover:shadow-raised"
                  >
                    <e.icon className="size-6 text-tone" aria-hidden="true" />
                    <span className="mt-3 block">
                      <span className="block font-serif text-lg font-medium leading-tight">{e.label}</span>
                      <span className="block text-sm text-muted-foreground">{e.value}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Section>

            <OfflineCard tripId={tripId} />
          </Stack>
        </div>
      </Stack>
    </Page>
  )
}
