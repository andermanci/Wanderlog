import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'
import { Button, Card, Empty, IconButton, Page, Segmented, Skeleton, type Tone } from '@/design'
import { useTrips } from '@/lib/queries/trips'
import { countdownLabel, generateICS, formatDate } from '@/lib/utils'

// Un color por viaje, sacado de los tonos del sistema (se adaptan solos al modo
// oscuro). `tone` pinta la leyenda; `css` es lo que entiende FullCalendar.
const COLORES: { tone: Tone; css: string }[] = [
  { tone: 'primary', css: 'var(--primary)' },
  { tone: 'flight', css: 'var(--act-flight)' },
  { tone: 'activity', css: 'var(--act-activity)' },
  { tone: 'restaurant', css: 'var(--act-restaurant)' },
  { tone: 'transport', css: 'var(--act-transport)' },
  { tone: 'place', css: 'var(--act-place)' },
  { tone: 'hotel', css: 'var(--act-hotel)' },
  { tone: 'bar', css: 'var(--cat-bar)' },
]

type Vista = 'dayGridMonth' | 'timeGridWeek'

/** Todos tus viajes en un calendario, por mes o por semana. */
export function CalendarPage() {
  const { data: trips, isLoading } = useTrips()
  const navigate = useNavigate()
  const calRef = useRef<FullCalendar>(null)
  const [vista, setVista] = useState<Vista>('dayGridMonth')
  const [titulo, setTitulo] = useState('')

  const events = useMemo(() => {
    if (!trips) return []
    return trips.map((trip, i) => {
      const color = COLORES[i % COLORES.length].css
      return {
        id: trip.id,
        title: trip.name,
        start: trip.start_date,
        // FullCalendar trata `end` como exclusivo: +1 día para pintar el último día.
        end: format(addDays(parseISO(trip.end_date), 1), 'yyyy-MM-dd'),
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        textColor: 'var(--background)',
      }
    })
  }, [trips])

  // El viaje que viene: el primero que aún no ha terminado. Si ya ha empezado,
  // está «en curso» y no lleva cuenta atrás.
  const proximo = useMemo(() => {
    if (!trips?.length) return null
    const hoy = format(new Date(), 'yyyy-MM-dd')
    let mejor = -1
    trips.forEach((t, i) => {
      if (t.end_date < hoy) return
      if (mejor < 0 || t.start_date < trips[mejor].start_date) mejor = i
    })
    if (mejor < 0) return null
    const trip = trips[mejor]
    return { trip, tone: COLORES[mejor % COLORES.length].tone, enCurso: trip.start_date <= hoy }
  }, [trips])

  function handleExportICS() {
    if (!trips?.length) return
    const icsEvents = trips.map(t => ({
      uid: t.id,
      title: t.name,
      start: format(parseISO(t.start_date), "yyyyMMdd'T'HHmmss'Z'"),
      end: format(parseISO(t.end_date), "yyyyMMdd'T'HHmmss'Z'"),
      description: t.description ?? '',
      location: t.destination,
    }))
    const ics = generateICS(icsEvents)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wanderlog.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  function cambiarVista(v: Vista) {
    setVista(v)
    calRef.current?.getApi().changeView(v)
  }

  return (
    <Page
      title="Calendario"
      subtitle="Todos tus viajes, de un vistazo."
      width="wide"
      actions={
        <Button variant="outline" onClick={handleExportICS} disabled={!trips?.length} title="Descarga un archivo para tu calendario (Google, Apple, Outlook…)">
          <Download aria-hidden="true" />
          Exportar .ics
        </Button>
      }
    >
      {/* Lo próximo: el viaje que viene (o el que está en marcha) y cuánto falta. */}
      {proximo && (
        <Link
          to={`/trips/${proximo.trip.id}`}
          data-tone={proximo.tone}
          className="group mb-8 flex overflow-hidden rounded-2xl border border-tone-line bg-tone-soft transition-shadow duration-200 hover:shadow-raised"
        >
          <span aria-hidden="true" className="w-1.5 shrink-0 bg-tone" />
          <span className="flex min-w-0 flex-1 flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-4 md:px-6 md:py-5">
            <span className="min-w-0">
              <span className="eyebrow block text-tone">{proximo.enCurso ? 'Ahora mismo' : 'Lo próximo'}</span>
              <span className="mt-1 block truncate font-serif text-2xl font-medium leading-tight tracking-tight md:text-3xl">
                {proximo.trip.name}
              </span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                {proximo.trip.destination} · <span className="tabular-nums">{formatDate(proximo.trip.start_date, 'd MMM')} – {formatDate(proximo.trip.end_date, 'd MMM yyyy')}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 font-serif text-3xl font-medium leading-none tracking-tight tabular-nums text-tone md:text-4xl">
              {proximo.enCurso ? 'En curso' : countdownLabel(proximo.trip.start_date)}
              <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </span>
        </Link>
      )}

      {/* Barra propia en vez de la de FullCalendar: mismos botones que el resto de la app. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <h2 className="title-hero w-full first-letter:uppercase md:w-auto" aria-live="polite">
          {titulo}
        </h2>
        <div className="flex w-full items-center justify-between gap-3 md:w-auto">
          <div className="flex items-center gap-1">
            <IconButton label="Anterior" variant="secondary" onClick={() => calRef.current?.getApi().prev()}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="Siguiente" variant="secondary" onClick={() => calRef.current?.getApi().next()}>
              <ChevronRight />
            </IconButton>
            <Button variant="ghost" onClick={() => calRef.current?.getApi().today()}>Hoy</Button>
          </div>
          <Segmented<Vista>
            label="Vista del calendario"
            value={vista}
            onChange={cambiarVista}
            options={[
              { value: 'dayGridMonth', label: 'Mes' },
              { value: 'timeGridWeek', label: 'Semana' },
            ]}
          />
        </div>
      </div>

      <Card pad="none" className="p-2 md:p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          events={events}
          headerToolbar={false}
          height="auto"
          datesSet={info => setTitulo(info.view.title)}
          // Los viajes se pueden abrir también con el teclado.
          eventInteractive
          // Con `!`: el CSS de FullCalendar va sin capa y gana a las utilidades.
          eventClassNames="cursor-pointer rounded-lg! px-2! py-0.5! text-xs font-semibold"
          eventClick={info => {
            info.jsEvent.preventDefault()
            navigate(`/trips/${info.event.id}`)
          }}
        />
      </Card>

      <div className="mt-6">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !trips?.length ? (
          <Empty
            icon={CalendarDays}
            title="Aún no hay viajes que enseñar"
            description="Cuando crees un viaje, sus fechas aparecerán aquí."
          >
            <Button asChild variant="primary">
              <Link to="/dashboard"><Plus aria-hidden="true" />Ir a mis viajes</Link>
            </Button>
          </Empty>
        ) : (
          <section aria-labelledby="leyenda-viajes">
            <h2 id="leyenda-viajes" className="eyebrow mb-2.5 font-sans">
              Tus viajes · toca uno para abrirlo
            </h2>
            <ul className="flex flex-wrap gap-2">
              {trips.map((t, i) => (
                <li key={t.id} className="min-w-0 max-w-full">
                  <Link
                    to={`/trips/${t.id}`}
                    data-tone={COLORES[i % COLORES.length].tone}
                    className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-full border border-tone-line bg-tone-soft py-1.5 pl-3 pr-4 text-sm transition-[filter,box-shadow] duration-150 hover:shadow-card hover:brightness-95 dark:hover:brightness-125"
                  >
                    <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full bg-tone" />
                    <span className="min-w-0 truncate font-semibold">{t.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatDate(t.start_date, 'd MMM')} – {formatDate(t.end_date, 'd MMM yyyy')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Page>
  )
}
