import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'
import { Button, Card, Empty, IconButton, Page, Section, Segmented, Skeleton, type Tone } from '@/design'
import { useTrips } from '@/lib/queries/trips'
import { generateICS, formatDate } from '@/lib/utils'

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
      <Card pad="sm" className="md:p-5">
        {/* Barra propia en vez de la de FullCalendar: mismos botones que el resto de la app. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <div className="flex items-center gap-1">
            <IconButton label="Anterior" variant="secondary" onClick={() => calRef.current?.getApi().prev()}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="Siguiente" variant="secondary" onClick={() => calRef.current?.getApi().next()}>
              <ChevronRight />
            </IconButton>
            <Button variant="ghost" onClick={() => calRef.current?.getApi().today()}>Hoy</Button>
          </div>
          <h2 className="title-section order-first w-full text-center first-letter:uppercase md:order-none md:w-auto" aria-live="polite">
            {titulo}
          </h2>
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
          eventClassNames="cursor-pointer"
          eventClick={info => {
            info.jsEvent.preventDefault()
            navigate(`/trips/${info.event.id}`)
          }}
        />
      </Card>

      <div className="mt-8">
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
          <Section title="Tus viajes" description="Cada viaje tiene su color en el calendario. Toca uno para abrirlo.">
            <ul className="flex flex-wrap gap-2">
              {trips.map((t, i) => (
                <li key={t.id}>
                  <Link
                    to={`/trips/${t.id}`}
                    data-tone={COLORES[i % COLORES.length].tone}
                    className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-border-strong bg-card px-4 py-1.5 text-sm transition-colors hover:bg-secondary"
                  >
                    <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-tone" />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground">
                      {formatDate(t.start_date, 'd MMM')} – {formatDate(t.end_date, 'd MMM yyyy')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </Page>
  )
}
