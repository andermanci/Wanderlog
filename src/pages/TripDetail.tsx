import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, DollarSign, FileText,
  Map as MapIcon, Package, Bell, Receipt, Pencil, ArrowRight, UserPlus, Users,
  CalendarClock, ChevronRight, Clock, Heart,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useTrip } from '@/lib/queries/trips'
import { useExpenses } from '@/lib/queries/expenses'
import { useReminders } from '@/lib/queries/reminders'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { usePackingItems } from '@/lib/queries/packing'
import { TripFormDialog } from '@/components/trips/TripFormDialog'
import { ShareTripDialog } from '@/components/trips/ShareTripDialog'
import { useAuthStore } from '@/store/authStore'
import { formatDate, formatCurrency, STATUS_LABELS, STATUS_COLORS, countdownLabel, sumByCurrency, effectiveStatus } from '@/lib/utils'

const QUICK_LINKS = [
  { label: 'Itinerario', icon: Calendar, path: 'itinerary' },
  { label: 'Mapa', icon: MapIcon, path: 'map' },
  { label: 'Documentos', icon: FileText, path: 'documents' },
  { label: 'Equipaje', icon: Package, path: 'packing' },
  { label: 'Gastos', icon: Receipt, path: 'expenses' },
  { label: 'Avisos', icon: Bell, path: 'reminders' },
  { label: 'Recuerdo del viaje', icon: Heart, path: 'memory' },
]

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: expenses } = useExpenses(tripId!)
  const { data: reminders } = useReminders(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: packing } = usePackingItems(tripId!)
  const { user, profile } = useAuthStore()
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const isOwner = !!trip && trip.user_id === user?.id

  const mainCurrency = profile?.default_currency ?? 'EUR'
  const totalsByCurrency = sumByCurrency(expenses ?? [])
  const totalGastos = totalsByCurrency[mainCurrency] ?? 0
  const otherTotals = Object.entries(totalsByCurrency).filter(([c]) => c !== mainCurrency)
  const presupuesto = trip?.budget_total ?? 0
  const pct = presupuesto > 0 ? Math.min((totalGastos / presupuesto) * 100, 100) : 0

  // Próxima actividad (de hoy en adelante)
  const dayDate = new Map((days ?? []).map(d => [d.id, d.date]))
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const nextActivity = (activities ?? [])
    .map(a => ({ a, date: dayDate.get(a.day_id) ?? '' }))
    .filter(x => x.date && x.date >= todayStr)
    .sort((x, y) => x.date !== y.date ? x.date.localeCompare(y.date) : x.a.order_index - y.a.order_index)[0]

  const packingTotal = packing?.length ?? 0
  const packingPct = packingTotal > 0 ? Math.round((packing!.filter(p => p.is_checked).length / packingTotal) * 100) : 0
  const pendingReminders = reminders?.filter(r => !r.is_sent && new Date(r.remind_at) > new Date()).length ?? 0

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-8 w-64" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-5 w-48" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  if (!trip) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Viaje no encontrado
    </div>
  )

  const status = effectiveStatus(trip)
  const statusColor = STATUS_COLORS[status]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground -mb-4">
        <Link to="/dashboard" className="hover:text-foreground transition-colors">Viajes</Link>
        <ChevronRight size={12} className="opacity-50" />
        <span className="text-foreground font-medium truncate max-w-[220px]">{trip.name}</span>
      </nav>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden"
        style={{ minHeight: 220 }}
      >
        {trip.cover_image_url
          ? <img src={trip.cover_image_url} alt={trip.name} className="w-full h-56 object-cover" />
          : <div className="w-full h-56" style={{ background: 'linear-gradient(135deg, var(--secondary), var(--card))' }} />
        }
        <div className="card-overlay absolute inset-0" />

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
                style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
              >
                {STATUS_LABELS[status]}
              </span>
              <h1 className="font-serif text-4xl font-medium text-white">{trip.name}</h1>
              <div className="flex items-center gap-1.5 text-white/70 text-sm mt-1">
                <MapPin size={14} style={{ color: 'var(--primary)' }} />
                <span>{trip.destination}</span>
                <span className="mx-1.5 opacity-30">·</span>
                <Calendar size={14} />
                <span>{formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}</span>
                <span className="mx-1.5 opacity-30">·</span>
                <span style={{ color: 'var(--primary)' }}>{countdownLabel(trip.start_date)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShareOpen(true)}
                  className="glass rounded-lg w-9 h-9 text-white hover:text-white"
                  title="Compartir viaje"
                >
                  <UserPlus size={16} />
                </Button>
              ) : (
                <span className="glass rounded-lg px-2.5 h-9 flex items-center gap-1.5 text-white/80 text-xs" title="Compartido contigo">
                  <Users size={14} /> Compartido
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditOpen(true)}
                className="glass rounded-lg w-9 h-9 text-white hover:text-white"
                title="Editar viaje"
              >
                <Pencil size={16} />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Description */}
      {trip.description && (
        <p className="text-muted-foreground leading-relaxed">{trip.description}</p>
      )}

      {/* Tags */}
      {trip.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trip.tags.map(tag => (
            <Badge key={tag} variant="outline"
              style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)' }}>
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Stats accionables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Próximo */}
        <Link
          to={`/trips/${tripId}/itinerary`}
          className="col-span-2 rounded-xl p-4 transition-colors hover:border-primary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <CalendarClock size={14} style={{ color: 'var(--primary)' }} /> Próximo
          </div>
          {nextActivity ? (
            <>
              <p className="font-medium line-clamp-1">{nextActivity.a.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                {format(new Date(nextActivity.date + 'T00:00:00'), "EEE dd MMM", { locale: es })}
                {nextActivity.a.start_time && <><Clock size={10} /> {nextActivity.a.start_time.slice(0, 5)}</>}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Sin actividades próximas</p>
          )}
        </Link>

        {/* Equipaje */}
        <Link
          to={`/trips/${tripId}/packing`}
          className="rounded-xl p-4 transition-colors hover:border-primary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <Package size={16} className="text-muted-foreground mb-2" />
          <p className="text-2xl font-serif font-medium text-foreground">{packingTotal > 0 ? `${packingPct}%` : '—'}</p>
          <p className="text-xs text-muted-foreground">Equipaje</p>
        </Link>

        {/* Avisos pendientes */}
        <Link
          to={`/trips/${tripId}/reminders`}
          className="rounded-xl p-4 transition-colors hover:border-primary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <Bell size={16} className="text-muted-foreground mb-2" />
          <p className="text-2xl font-serif font-medium text-foreground">{pendingReminders}</p>
          <p className="text-xs text-muted-foreground">Avisos pendientes</p>
        </Link>
      </div>

      {/* Presupuesto */}
      {presupuesto > 0 && (
        <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign size={16} style={{ color: 'var(--primary)' }} />
              <span className="font-medium">Presupuesto</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatCurrency(totalGastos, mainCurrency)} de {formatCurrency(presupuesto, mainCurrency)}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{pct.toFixed(0)}% utilizado</span>
            <span className={totalGastos > presupuesto ? 'text-destructive' : 'text-green-400'}>
              {totalGastos > presupuesto
                ? `Excedido ${formatCurrency(totalGastos - presupuesto, mainCurrency)}`
                : `Restante: ${formatCurrency(presupuesto - totalGastos, mainCurrency)}`}
            </span>
          </div>
          {otherTotals.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Además, en otras divisas: {otherTotals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Quick links */}
      <div>
        <h2 className="font-serif text-xl mb-4">Secciones del viaje</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ label, icon: Icon, path }) => (
            <Link key={path} to={`/trips/${tripId}/${path}`}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer group"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
                    <Icon size={16} style={{ color: 'var(--primary)' }} />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <ArrowRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      <TripFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        trip={trip}
      />

      <ShareTripDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tripId={trip.id}
      />
    </div>
  )
}
