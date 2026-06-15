import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Search, SlidersHorizontal, Bell, MapPin, Calendar, CalendarClock, Clock, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripCard } from '@/components/trips/TripCard'
import { TripFormDialog } from '@/components/trips/TripFormDialog'
import { useTrips, useDeleteTrip, useCreateTrip } from '@/lib/queries/trips'
import { OnboardingWelcome } from '@/components/OnboardingWelcome'
import { usePendingReminders } from '@/lib/queries/reminders'
import { useTodayActivities } from '@/lib/queries/itinerary'
import { useAuthStore } from '@/store/authStore'
import { formatDate, STATUS_LABELS, ACTIVITY_COLORS, ACTIVITY_LABELS, effectiveStatus } from '@/lib/utils'
import type { Trip } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function Dashboard() {
  const { profile } = useAuthStore()
  const { data: trips, isLoading } = useTrips()
  const { data: reminders } = usePendingReminders()
  const { data: todayActs } = useTodayActivities()
  const deleteTrip = useDeleteTrip()
  const createTrip = useCreateTrip()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Bienvenida de primer uso (una sola vez).
  useEffect(() => {
    if (!localStorage.getItem('wanderlog-welcome-seen')) setShowWelcome(true)
  }, [])
  function closeWelcome() {
    localStorage.setItem('wanderlog-welcome-seen', '1')
    setShowWelcome(false)
  }

  // Crea un viaje de ejemplo para explorar la app sin partir de cero.
  async function createExample() {
    setSeeding(true)
    const today = new Date()
    const start = new Date(today.getTime() + 30 * 864e5)
    const end = new Date(today.getTime() + 34 * 864e5)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    try {
      await createTrip.mutateAsync({
        name: 'Escapada a Lisboa (ejemplo)',
        description: 'Un viaje de ejemplo para que veas cómo funciona. Edítalo o bórralo cuando quieras.',
        destination: 'Lisboa, Portugal',
        start_date: iso(start),
        end_date: iso(end),
        cover_image_url: null,
        status: 'planning',
        budget_total: 600,
        tags: ['ejemplo'],
      })
    } finally {
      setSeeding(false)
    }
  }

  const filteredTrips = useMemo(() => {
    if (!trips) return []
    return trips.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.destination.toLowerCase().includes(search.toLowerCase()) ||
        t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || effectiveStatus(t) === statusFilter
      return matchSearch && matchStatus
    })
  }, [trips, search, statusFilter])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="flex lg:h-full">
      {/* Main */}
      <div className="flex-1 lg:overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <p className="text-muted-foreground text-sm mb-1">{greeting},</p>
            <h1 className="text-4xl font-serif font-medium text-foreground">
              {profile?.full_name?.split(' ')[0] ?? 'Viajero'} ✦
            </h1>
          </motion.div>

          {/* Hoy: actividades del itinerario de hoy */}
          {todayActs && todayActs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl p-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-serif text-lg">Hoy</h2>
                <Badge variant="outline" className="text-xs">{todayActs.length}</Badge>
              </div>
              <div className="space-y-1">
                {todayActs.map(a => {
                  const color = ACTIVITY_COLORS[a.type]
                  return (
                    <Link
                      key={a.id}
                      to={`/trips/${a.trip_id}/itinerary`}
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <span className="text-xs tabular-nums w-12 flex-shrink-0 flex items-center gap-1 text-muted-foreground">
                        {a.start_time
                          ? <>{a.start_time.slice(0, 5)}</>
                          : <Clock size={11} className="opacity-50" />}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-medium flex-1 min-w-0 line-clamp-1">{a.title}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline" style={{ background: `${color}18`, color }}>
                        {ACTIVITY_LABELS[a.type]}
                      </span>
                      {a.trips && (
                        <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline max-w-[120px] truncate">
                          {a.trips.name}
                        </span>
                      )}
                      <ChevronRight size={14} className="text-muted-foreground opacity-60 hover:opacity-100 transition-opacity flex-shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar viajes, destinos, etiquetas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SlidersHorizontal size={14} className="mr-2" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => { setEditTrip(null); setFormOpen(true) }}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
                className="gap-2 font-medium"
              >
                <Plus size={16} />
                Nuevo viaje
              </Button>
            </div>
          </div>

          {/* Contadores rápidos */}
          {trips && trips.length > 0 && (
            <div className="flex gap-3 mb-6 flex-wrap">
              {Object.entries(STATUS_LABELS).map(([key, label]) => {
                const count = trips.filter(t => effectiveStatus(t) === key).length
                if (!count) return null
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(prev => prev === key ? 'all' : key)}
                    className="text-xs px-3 py-1 rounded-full border transition-all"
                    style={{
                      borderColor: statusFilter === key ? 'var(--primary)' : 'var(--border)',
                      color: statusFilter === key ? 'var(--primary)' : 'var(--muted-foreground)',
                      background: statusFilter === key ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                    }}
                  >
                    {label} · {count}
                  </button>
                )
              })}
            </div>
          )}

          {/* Grid de viajes */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <Skeleton className="h-52 w-full" style={{ background: 'var(--secondary)' }} />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" style={{ background: 'var(--secondary)' }} />
                    <Skeleton className="h-4 w-1/2" style={{ background: 'var(--secondary)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTrips.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)' }}>
                <MapPin size={32} style={{ color: 'var(--primary)' }} />
              </div>
              <h3 className="font-serif text-2xl text-foreground mb-2">
                {search || statusFilter !== 'all' ? 'Sin resultados' : 'Tu primera aventura te espera'}
              </h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                {search || statusFilter !== 'all'
                  ? 'Prueba con otros filtros o búsquedas'
                  : 'Planifica tu próximo viaje y mantén todo organizado en un solo lugar.'}
              </p>
              {!search && statusFilter === 'all' && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => { setEditTrip(null); setFormOpen(true) }}
                    style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Crear primer viaje
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={createExample} disabled={seeding}>
                    {seeding ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                    Probar con un ejemplo
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTrips.map((trip, i) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  index={i}
                  onEdit={(t) => { setEditTrip(t); setFormOpen(true) }}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel lateral de avisos */}
      {reminders && reminders.length > 0 && (
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden lg:flex flex-col w-72 border-l border-border p-4 h-full"
          style={{ background: 'var(--sidebar)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-lg">Próximos avisos</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-3">
              {reminders.map(r => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-medium text-foreground line-clamp-1">{r.title}</p>
                  {r.trips && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin size={10} />
                      {r.trips.destination}
                    </p>
                  )}
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                    <Calendar size={10} />
                    {format(parseISO(r.remind_at), "dd MMM · HH:mm", { locale: es })}
                  </p>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </motion.aside>
      )}

      {/* Modales */}
      <TripFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTrip(null) }}
        trip={editTrip}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> y todos sus datos: itinerario, documentos, gastos y favoritos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteTrip.mutate(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OnboardingWelcome open={showWelcome} onClose={closeWelcome} />
    </div>
  )
}
