import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, SlidersHorizontal, Bell, MapPin, Calendar } from 'lucide-react'
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
import { useTrips, useDeleteTrip } from '@/lib/queries/trips'
import { usePendingReminders } from '@/lib/queries/reminders'
import { useAuthStore } from '@/store/authStore'
import { formatDate, STATUS_LABELS } from '@/lib/utils'
import type { Trip } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function Dashboard() {
  const { profile } = useAuthStore()
  const { data: trips, isLoading } = useTrips()
  const { data: reminders } = usePendingReminders()
  const deleteTrip = useDeleteTrip()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)

  const filteredTrips = useMemo(() => {
    if (!trips) return []
    return trips.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.destination.toLowerCase().includes(search.toLowerCase()) ||
        t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [trips, search, statusFilter])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="flex h-full">
      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
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
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}
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
                const count = trips.filter(t => t.status === key).length
                if (!count) return null
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(prev => prev === key ? 'all' : key)}
                    className="text-xs px-3 py-1 rounded-full border transition-all"
                    style={{
                      borderColor: statusFilter === key ? '#c9a84c' : '#2a2a3a',
                      color: statusFilter === key ? '#c9a84c' : '#a89b8a',
                      background: statusFilter === key ? 'rgba(201,168,76,0.1)' : 'transparent',
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
                <div key={i} className="rounded-xl overflow-hidden" style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
                  <Skeleton className="h-52 w-full" style={{ background: '#1a1a26' }} />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" style={{ background: '#1a1a26' }} />
                    <Skeleton className="h-4 w-1/2" style={{ background: '#1a1a26' }} />
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
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
                <MapPin size={32} style={{ color: '#c9a84c' }} />
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
                <Button
                  className="mt-6 gap-2"
                  onClick={() => { setEditTrip(null); setFormOpen(true) }}
                  style={{ background: 'linear-gradient(135deg, #c9a84c, #e4c97a)', color: '#0a0a0f' }}
                >
                  <Plus size={16} />
                  Crear primer viaje
                </Button>
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
          style={{ background: '#0d0d16' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} style={{ color: '#c9a84c' }} />
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
                  style={{ background: '#12121a', border: '1px solid #2a2a3a' }}
                >
                  <p className="text-sm font-medium text-foreground line-clamp-1">{r.title}</p>
                  {r.trips && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin size={10} />
                      {r.trips.destination}
                    </p>
                  )}
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#c9a84c' }}>
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
        <AlertDialogContent style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
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
    </div>
  )
}
