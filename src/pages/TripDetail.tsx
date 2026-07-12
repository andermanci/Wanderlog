import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, FileText, Map as MapIcon, Package, Bell, Receipt, Pencil, UserPlus, Users,
  CalendarClock, ChevronRight, Clock, Heart, Bookmark, BookOpen, Wallet, Sparkles, AlertTriangle, Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useTrip } from '@/lib/queries/trips'
import { useExpenses } from '@/lib/queries/expenses'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { usePackingItems } from '@/lib/queries/packing'
import { useDocuments } from '@/lib/queries/documents'
import { useExchangeRates, sumConverted } from '@/lib/queries/rates'
import { TripFormDialog } from '@/components/trips/TripFormDialog'
import { ShareTripDialog } from '@/components/trips/ShareTripDialog'
import { OfflineSaveButton } from '@/components/trips/OfflineSaveButton'
import { TodayHub } from '@/components/trips/TodayHub'
import { useAuthStore } from '@/store/authStore'
import {
  formatDate, formatCurrency, STATUS_LABELS, STATUS_COLORS, countdownLabel,
  sumByCurrency, effectiveStatus, PERSONAL_DOC_CATEGORIES,
} from '@/lib/utils'

// Navegación secundaria: acceso a TODAS las secciones (en móvil también están
// en "Más" de la barra inferior). Compacta, sin competir con el contenido.
const SECTIONS = [
  { label: 'Itinerario', icon: Calendar, path: 'itinerary' },
  { label: 'Mapa', icon: MapIcon, path: 'map' },
  { label: 'Lugares', icon: Bookmark, path: 'places' },
  { label: 'Guía', icon: BookOpen, path: 'guide' },
  { label: 'Documentos', icon: FileText, path: 'documents' },
  { label: 'Equipaje', icon: Package, path: 'packing' },
  { label: 'Gastos', icon: Receipt, path: 'expenses' },
  { label: 'Avisos', icon: Bell, path: 'reminders' },
  { label: 'Recuerdo', icon: Heart, path: 'memory' },
]

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: trip, isLoading } = useTrip(tripId!)
  const { data: expenses } = useExpenses(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: packing } = usePackingItems(tripId!)
  const { data: documents } = useDocuments(tripId!)
  const { user, profile } = useAuthStore()
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const isOwner = !!trip && trip.user_id === user?.id

  const mainCurrency = profile?.default_currency ?? 'EUR'
  const totalsByCurrency = sumByCurrency(expenses ?? [])
  const otherTotals = Object.entries(totalsByCurrency).filter(([c]) => c !== mainCurrency)
  const { data: rates } = useExchangeRates(mainCurrency)
  const totalGastos = sumConverted(expenses ?? [], mainCurrency, rates).total
  const presupuesto = trip?.budget_total ?? 0
  const pct = presupuesto > 0 ? Math.min((totalGastos / presupuesto) * 100, 100) : 0

  // Próxima actividad (de hoy en adelante) → "lo siguiente que harás".
  const dayDate = new Map((days ?? []).map(d => [d.id, d.date]))
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const nextActivity = (activities ?? [])
    .map(a => ({ a, date: dayDate.get(a.day_id) ?? '' }))
    .filter(x => x.date && x.date >= todayStr)
    .sort((x, y) => x.date !== y.date ? x.date.localeCompare(y.date) : x.a.order_index - y.a.order_index)[0]

  // Preparativos
  const totalDays = days?.length ?? 0
  const plannedDayIds = new Set((activities ?? []).map(a => a.day_id))
  const plannedDays = (days ?? []).filter(d => plannedDayIds.has(d.id)).length
  const actCount = activities?.length ?? 0
  const packingTotal = packing?.length ?? 0
  const packingPct = packingTotal > 0 ? Math.round((packing!.filter(p => p.is_checked).length / packingTotal) * 100) : 0
  const docCount = documents?.length ?? 0
  const hasId = (documents ?? []).some(d => PERSONAL_DOC_CATEGORIES.includes(d.category))

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-32 w-full rounded-2xl" style={{ background: 'var(--secondary)' }} />
        <Skeleton className="h-5 w-48" style={{ background: 'var(--secondary)' }} />
      </div>
    )
  }

  if (!trip) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">Viaje no encontrado</div>
  )

  const status = effectiveStatus(trip)
  const statusColor = STATUS_COLORS[status]
  const phase: 'pre' | 'now' | 'past' = status === 'in_progress' ? 'now' : status === 'completed' ? 'past' : 'pre'

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/dashboard" className="hover:text-foreground transition-colors">Viajes</Link>
        <ChevronRight size={12} className="opacity-50" />
        <span className="text-foreground font-medium truncate max-w-[220px]">{trip.name}</span>
      </nav>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden" style={{ minHeight: 220 }}>
        {trip.cover_image_url
          ? <img src={trip.cover_image_url} alt={trip.name} className="w-full h-56 object-cover" />
          : <div className="w-full h-56" style={{ background: 'linear-gradient(135deg, var(--secondary), var(--card))' }} />}
        <div className="card-overlay absolute inset-0" />

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {isOwner ? (
            <Button size="icon" variant="ghost" onClick={() => setShareOpen(true)}
              className="glass-dark rounded-lg w-9 h-9 text-white hover:text-white" title="Compartir viaje" aria-label="Compartir viaje">
              <UserPlus size={16} aria-hidden="true" />
            </Button>
          ) : (
            <span className="glass-dark rounded-lg px-2.5 h-9 flex items-center gap-1.5 text-white/90 text-xs" title="Compartido contigo">
              <Users size={14} /> Compartido
            </span>
          )}
          <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)}
            className="glass-dark rounded-lg w-9 h-9 text-white hover:text-white" title="Editar viaje" aria-label="Editar viaje">
            <Pencil size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-2 inline-block"
            style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>
            {STATUS_LABELS[status]}
          </span>
          <h1 className="font-serif text-2xl sm:text-4xl font-medium text-white break-words leading-tight">{trip.name}</h1>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-white/70 text-xs sm:text-sm mt-1.5">
            <span className="flex items-center gap-1"><MapPin size={13} style={{ color: 'var(--primary)' }} />{trip.destination}</span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1"><Calendar size={13} />{formatDate(trip.start_date, 'dd MMM')} — {formatDate(trip.end_date, 'dd MMM yyyy')}</span>
            {phase === 'pre' && (<><span className="opacity-30">·</span><span style={{ color: 'var(--primary)' }}>{countdownLabel(trip.start_date)}</span></>)}
          </div>
        </div>
      </motion.div>

      {/* Tags + descripción (compacto) */}
      {(trip.tags.length > 0 || trip.description) && (
        <div className="space-y-2">
          {trip.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trip.tags.map(tag => (
                <Badge key={tag} variant="outline"
                  style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)' }}>{tag}</Badge>
              ))}
            </div>
          )}
          {trip.description && <p className="text-sm text-muted-foreground leading-relaxed">{trip.description}</p>}
        </div>
      )}

      {/* ===== Bloque protagonista, según la fase del viaje ===== */}
      {phase === 'now' && <TodayHub trip={trip} activities={activities} days={days} />}

      {phase === 'pre' && (
        <section className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {/* Próximo plan */}
          {nextActivity ? (
            <Link to={`/trips/${tripId}/itinerary/${nextActivity.a.id}`}
              className="flex items-center gap-3 p-3 rounded-xl mb-4 transition-colors hover:bg-secondary"
              style={{ background: 'var(--secondary)' }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
                <CalendarClock size={18} style={{ color: 'var(--primary)' }} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Primer plan</p>
                <p className="font-medium line-clamp-1">{nextActivity.a.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  {format(new Date(nextActivity.date + 'T00:00:00'), "EEE dd MMM", { locale: es })}
                  {nextActivity.a.start_time && <><Clock size={10} /> {nextActivity.a.start_time.slice(0, 5)}</>}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </Link>
          ) : (
            <Link to={`/trips/${tripId}/itinerary/new`}
              className="flex items-center gap-3 p-3 rounded-xl mb-4 border border-dashed border-border hover:border-primary transition-colors">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
                <Plus size={18} style={{ color: 'var(--primary)' }} />
              </span>
              <div className="flex-1">
                <p className="font-medium text-sm">Planifica tu primer día</p>
                <p className="text-xs text-muted-foreground">Añade vuelos, hoteles y actividades</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </Link>
          )}

          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1 px-1">Preparativos</p>
          <div className="divide-y divide-border">
            <ReadinessRow to={`/trips/${tripId}/itinerary`} icon={Calendar} label="Itinerario"
              value={actCount > 0 ? `${actCount} actividad${actCount > 1 ? 'es' : ''} · ${plannedDays}/${totalDays} días` : 'Sin planificar'}
              done={actCount > 0} />
            <ReadinessRow to={`/trips/${tripId}/documents`} icon={FileText} label="Documentos"
              value={docCount > 0 ? `${docCount} guardado${docCount > 1 ? 's' : ''}` : 'Sin documentos'}
              warn={!hasId ? 'Falta DNI/pasaporte' : undefined} done={docCount > 0} />
            <ReadinessRow to={`/trips/${tripId}/packing`} icon={Package} label="Equipaje"
              value={packingTotal > 0 ? `${packingPct}% preparado` : 'Sin lista'} done={packingTotal > 0 && packingPct === 100} />
          </div>
        </section>
      )}

      {phase === 'past' && (
        <section className="rounded-2xl p-5 text-center" style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--card))', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)' }}>
          <Sparkles size={22} style={{ color: 'var(--primary)' }} className="mx-auto mb-2" />
          <h2 className="font-serif text-xl font-medium">Viaje completado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalDays || '—'} días · {actCount} actividad{actCount !== 1 ? 'es' : ''}
            {totalGastos > 0 && ` · ${formatCurrency(totalGastos, mainCurrency)} gastados`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <Button asChild className="gap-2" variant="brand">
              <Link to={`/trips/${tripId}/memory`}><Heart size={15} /> Ver recuerdo</Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to={`/trips/${tripId}/expenses`}><Receipt size={15} /> Gastos</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Presupuesto (en cualquier fase, si está definido) */}
      {presupuesto > 0 && (
        <Link to={`/trips/${tripId}/expenses`} className="block rounded-2xl p-5 transition-colors hover:border-primary"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Wallet size={16} style={{ color: 'var(--primary)' }} /><span className="font-medium">Presupuesto</span></div>
            <span className="text-sm text-muted-foreground">{formatCurrency(totalGastos, mainCurrency)} de {formatCurrency(presupuesto, mainCurrency)}</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{pct.toFixed(0)}% utilizado</span>
            <span className={totalGastos > presupuesto ? 'text-destructive' : ''}>
              {totalGastos > presupuesto
                ? `Excedido ${formatCurrency(totalGastos - presupuesto, mainCurrency)}`
                : `Restante ${formatCurrency(presupuesto - totalGastos, mainCurrency)}`}
            </span>
          </div>
          {otherTotals.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">Otras divisas: {otherTotals.map(([c, v]) => formatCurrency(v, c)).join(' · ')}</p>
          )}
        </Link>
      )}

      {/* ===== Navegación secundaria (compacta) ===== */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 px-1">Secciones</p>
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
          {SECTIONS.map(({ label, icon: Icon, path }) => (
            <Link key={path} to={`/trips/${tripId}/${path}`}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-border bg-card transition-all hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_7%,var(--card))] active:scale-[0.98]">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
                <Icon size={17} style={{ color: 'var(--primary)' }} />
              </span>
              <span className="text-xs font-medium text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Disponibilidad sin conexión */}
      <OfflineSaveButton tripId={trip.id} />

      <TripFormDialog open={editOpen} onClose={() => setEditOpen(false)} trip={trip} />
      <ShareTripDialog open={shareOpen} onClose={() => setShareOpen(false)} tripId={trip.id} />
    </div>
  )
}

// Fila de preparativo: icono + etiqueta + estado, con aviso opcional. Enlaza a su sección.
function ReadinessRow({ to, icon: Icon, label, value, warn, done }: {
  to: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  label: string
  value: string
  warn?: string
  done?: boolean
}) {
  return (
    <Link to={to} className="flex items-center gap-3 py-2.5 group">
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: done ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--secondary)' }}>
        <Icon size={16} style={{ color: done ? 'var(--primary)' : 'var(--muted-foreground)' }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{value}</p>
      </div>
      {warn && (
        <span className="hidden sm:flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
          <AlertTriangle size={10} /> {warn}
        </span>
      )}
      <ChevronRight size={15} className="text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
    </Link>
  )
}
