import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, Tag, DollarSign, FileText,
  Map, Package, Bell, Receipt, Pencil, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useTrip } from '@/lib/queries/trips'
import { useExpenses } from '@/lib/queries/expenses'
import { useDocuments } from '@/lib/queries/documents'
import { useReminders } from '@/lib/queries/reminders'
import { TripFormDialog } from '@/components/trips/TripFormDialog'
import { formatDate, formatCurrency, STATUS_LABELS, STATUS_COLORS, countdownLabel } from '@/lib/utils'

const QUICK_LINKS = [
  { label: 'Itinerario', icon: Calendar, path: 'itinerary' },
  { label: 'Mapa', icon: Map, path: 'map' },
  { label: 'Documentos', icon: FileText, path: 'documents' },
  { label: 'Equipaje', icon: Package, path: 'packing' },
  { label: 'Gastos', icon: Receipt, path: 'expenses' },
  { label: 'Avisos', icon: Bell, path: 'reminders' },
]

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: expenses } = useExpenses(tripId!)
  const { data: documents } = useDocuments(tripId!)
  const { data: reminders } = useReminders(tripId!)
  const [editOpen, setEditOpen] = useState(false)

  const totalGastos = expenses?.reduce((sum, e) => sum + e.amount, 0) ?? 0
  const presupuesto = trip?.budget_total ?? 0
  const pct = presupuesto > 0 ? Math.min((totalGastos / presupuesto) * 100, 100) : 0

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" style={{ background: '#1a1a26' }} />
        <Skeleton className="h-8 w-64" style={{ background: '#1a1a26' }} />
        <Skeleton className="h-5 w-48" style={{ background: '#1a1a26' }} />
      </div>
    )
  }

  if (!trip) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Viaje no encontrado
    </div>
  )

  const statusColor = STATUS_COLORS[trip.status]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden"
        style={{ minHeight: 220 }}
      >
        {trip.cover_image_url
          ? <img src={trip.cover_image_url} alt={trip.name} className="w-full h-56 object-cover" />
          : <div className="w-full h-56" style={{ background: 'linear-gradient(135deg, #1a1a26, #12121a)' }} />
        }
        <div className="card-overlay absolute inset-0" />

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
                style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
              >
                {STATUS_LABELS[trip.status]}
              </span>
              <h1 className="font-serif text-4xl font-medium text-white">{trip.name}</h1>
              <div className="flex items-center gap-1.5 text-white/70 text-sm mt-1">
                <MapPin size={14} style={{ color: '#c9a84c' }} />
                <span>{trip.destination}</span>
                <span className="mx-1.5 opacity-30">·</span>
                <Calendar size={14} />
                <span>{formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}</span>
                <span className="mx-1.5 opacity-30">·</span>
                <span style={{ color: '#c9a84c' }}>{countdownLabel(trip.start_date)}</span>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="glass rounded-lg w-9 h-9 text-white hover:text-white"
            >
              <Pencil size={16} />
            </Button>
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
              style={{ borderColor: 'rgba(201,168,76,0.3)', color: '#c9a84c' }}>
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Documentos', value: documents?.length ?? 0, icon: FileText },
          { label: 'Recordatorios', value: reminders?.filter(r => !r.is_sent).length ?? 0, icon: Bell },
          { label: 'Gastos registrados', value: expenses?.length ?? 0, icon: Receipt },
          { label: 'Pendientes', value: reminders?.filter(r => !r.is_sent && new Date(r.remind_at) > new Date()).length ?? 0, icon: Bell },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
            <Icon size={16} className="text-muted-foreground mb-2" />
            <p className="text-2xl font-serif font-medium text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Presupuesto */}
      {presupuesto > 0 && (
        <div className="rounded-xl p-5" style={{ background: '#12121a', border: '1px solid #2a2a3a' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign size={16} style={{ color: '#c9a84c' }} />
              <span className="font-medium">Presupuesto</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatCurrency(totalGastos)} de {formatCurrency(presupuesto)}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{pct.toFixed(0)}% utilizado</span>
            <span className={totalGastos > presupuesto ? 'text-destructive' : 'text-green-400'}>
              {totalGastos > presupuesto
                ? `Excedido ${formatCurrency(totalGastos - presupuesto)}`
                : `Restante: ${formatCurrency(presupuesto - totalGastos)}`}
            </span>
          </div>
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
                style={{ background: '#12121a', border: '1px solid #2a2a3a' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <Icon size={16} style={{ color: '#c9a84c' }} />
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
    </div>
  )
}
