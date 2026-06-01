import { useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTrips } from '@/lib/queries/trips'
import { generateICS } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

const TRIP_COLORS = [
  'var(--primary)', '#6366f1', '#22c55e', '#f97316', '#06b6d4',
  '#a855f7', '#ec4899', '#14b8a6',
]

export function CalendarPage() {
  const { data: trips } = useTrips()
  const calRef = useRef<FullCalendar>(null)

  const events = useMemo(() => {
    if (!trips) return []
    return trips.map((trip, i) => ({
      id: trip.id,
      title: `✈ ${trip.name}`,
      start: trip.start_date,
      end: trip.end_date,
      backgroundColor: TRIP_COLORS[i % TRIP_COLORS.length],
      borderColor: TRIP_COLORS[i % TRIP_COLORS.length],
      textColor: '#ffffff',
      extendedProps: { trip },
      url: `/trips/${trip.id}`,
    }))
  }, [trips])

  function handleExportICS() {
    if (!trips?.length) return
    const icsEvents = trips.map((t, i) => ({
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-medium">Calendario</h1>
          <p className="text-muted-foreground text-sm mt-1">Vista global de todos tus viajes</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 text-sm"
          onClick={handleExportICS}
          style={{ borderColor: 'var(--border)' }}
        >
          <Download size={14} />
          Exportar .ics
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden p-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          events={events}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          height="auto"
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            if (info.event.url) {
              window.location.href = info.event.url
            }
          }}
          dayCellClassNames="hover:bg-secondary cursor-pointer"
        />
      </motion.div>

      {/* Leyenda */}
      {trips && trips.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {trips.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: TRIP_COLORS[i % TRIP_COLORS.length] }}
              />
              {t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
