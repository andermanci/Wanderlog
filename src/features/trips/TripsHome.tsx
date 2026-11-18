import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, Clock, MapPin, Plus, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  ActivityIcon, Button, Chip, Confirm, Empty, Input, Page, Row, RowList, Section, Skeleton, Stack,
} from '@/design'
import { useCreateTrip, useDeleteTrip, useDuplicateTrip, useTrips } from '@/lib/queries/trips'
import { usePendingReminders } from '@/lib/queries/reminders'
import { useTodayActivities } from '@/lib/queries/itinerary'
import { useMyLimits } from '@/lib/queries/limits'
import { bloqueoParaCrearViaje } from '@/lib/limits'
import { useAuthStore } from '@/store/authStore'
import { ACTIVITY_LABELS, effectiveStatus, STATUS_LABELS } from '@/lib/utils'
import { loadAudioguideDraft } from '@/lib/audioguide/draft'
import { scopeRoute } from '@/lib/audioguide/scope'
import { useUiStore } from '@/shell/uiStore'
import { OnboardingWelcome } from '@/features/onboarding/OnboardingWelcome'
import { PwaInstallBanner } from '@/features/onboarding/PwaInstallBanner'
import type { Trip } from '@/types/database'
import { TripCard } from './TripCard'
import { deleteTripCopy } from './copy'

// Solo un aviso de «audioguía a medias» por arranque de la app (iOS relanza
// la PWA aquí cuando la mata en segundo plano).
let draftNotified = false

const GROUPS: { key: string; title: string; match: (status: string) => boolean }[] = [
  { key: 'now', title: 'En curso', match: s => s === 'in_progress' },
  { key: 'next', title: 'Próximos', match: s => s === 'planning' || s === 'confirmed' },
  { key: 'past', title: 'Pasados', match: s => s === 'completed' },
]

/** La portada de la app: lo de hoy arriba, y debajo todos los viajes. */
export function TripsHome() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const { data: trips, isLoading } = useTrips()
  const { data: reminders } = usePendingReminders()
  const { data: todayActs } = useTodayActivities()
  const deleteTrip = useDeleteTrip()
  const createTrip = useCreateTrip()
  const duplicateTrip = useDuplicateTrip()
  const openTripForm = useUiStore(s => s.openTripForm)

  // Adelantarse aquí permite explicar el motivo; quien de verdad lo impide es la RLS de `trips`.
  const { data: limites } = useMyLimits()
  const bloqueoCrear = bloqueoParaCrearViaje(limites, trips?.length ?? 0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('wanderlog-welcome-seen'))
  const [seeding, setSeeding] = useState(false)

  // Si hay una audioguía a medias (la PWA se reinició al volver de la app de
  // la IA), ofrecer volver justo donde estaba con un toque.
  useEffect(() => {
    if (draftNotified) return
    const draft = loadAudioguideDraft()
    if (!draft) return
    draftNotified = true
    toast(`Audioguía a medias: ${draft.title}`, {
      description: 'Puedes continuar donde lo dejaste.',
      duration: 12000,
      action: { label: 'Continuar', onClick: () => navigate(scopeRoute(draft.tripId, draft.scope)) },
    })
  }, [navigate])

  function closeWelcome() {
    localStorage.setItem('wanderlog-welcome-seen', '1')
    setShowWelcome(false)
  }

  // Un viaje de muestra para explorar la app sin partir de cero.
  async function createExample() {
    setSeeding(true)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    try {
      await createTrip.mutateAsync({
        name: 'Escapada a Lisboa (ejemplo)',
        description: 'Un viaje de ejemplo para que veas cómo funciona. Edítalo o bórralo cuando quieras.',
        destination: 'Lisboa, Portugal',
        start_date: iso(new Date(Date.now() + 30 * 864e5)),
        end_date: iso(new Date(Date.now() + 34 * 864e5)),
        cover_image_url: null,
        status: 'planning',
        budget_total: 600,
        tags: ['ejemplo'],
      })
    } catch { /* la mutación ya avisa */ } finally {
      setSeeding(false)
    }
  }

  const filtering = !!search || statusFilter !== 'all'
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (trips ?? []).filter(t => {
      const matchSearch = !q || t.name.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q)
        || t.tags.some(tag => tag.toLowerCase().includes(q))
      return matchSearch && (statusFilter === 'all' || effectiveStatus(t) === statusFilter)
    })
  }, [trips, search, statusFilter])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = profile?.full_name?.split(' ')[0]

  const cardProps = {
    readOnly: !!limites?.is_suspended,
    onEdit: (t: Trip) => openTripForm(t.id),
    onDelete: setDeleteTarget,
    onDuplicate: (t: Trip) => duplicateTrip.mutate(t.id),
  }
  const newTripButton = (
    <Button variant="primary" disabled={!!bloqueoCrear} title={bloqueoCrear ?? undefined} onClick={() => openTripForm()}>
      <Plus /> Nuevo viaje
    </Button>
  )
  const hasToday = (todayActs?.length ?? 0) > 0
  const hasReminders = (reminders?.length ?? 0) > 0

  return (
    <Page
      width="wide"
      eyebrow={greeting}
      title={<span className="title-hero">{firstName ? `Hola, ${firstName}` : 'Tus viajes'}</span>}
      actions={(trips?.length ?? 0) > 0 ? newTripButton : undefined}
    >
      <Stack gap="lg">
        <PwaInstallBanner />

        {/* El motivo va escrito, no solo el botón gris: sin explicación se lee como avería. */}
        {bloqueoCrear && <p className="text-sm text-muted-foreground">{bloqueoCrear}</p>}

        {(hasToday || hasReminders) && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
            {hasToday && (
              <Section title="Hoy" description="Lo que tienes planeado para hoy.">
                <RowList>
                  {todayActs!.map(a => (
                    <Row
                      key={a.id}
                      to={`/trips/${a.trip_id}/itinerary/${a.id}`}
                      leading={
                        <span data-tone={a.type} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                          <ActivityIcon type={a.type} className="size-5" />
                        </span>
                      }
                      title={a.title}
                      subtitle={[ACTIVITY_LABELS[a.type], a.trips?.name].filter(Boolean).join(' · ')}
                      trailing={a.start_time
                        ? <span className="font-medium tabular-nums text-foreground">{a.start_time.slice(0, 5)}</span>
                        : <Clock className="size-4 opacity-50" aria-label="Sin hora" />}
                      chevron
                    />
                  ))}
                </RowList>
              </Section>
            )}
            {hasReminders && (
              <Section
                title="Próximos avisos"
                action={reminders!.length > 3
                  ? <Button variant="link" size="sm" asChild><Link to={`/trips/${reminders![0].trip_id}/reminders`}>Ver todos ({reminders!.length})</Link></Button>
                  : undefined}
              >
                <RowList>
                  {reminders!.slice(0, 3).map(r => (
                    <Row
                      key={r.id}
                      to={`/trips/${r.trip_id}/reminders`}
                      icon={Bell} tone="hotel"
                      title={r.title}
                      subtitle={[r.trips?.destination, format(parseISO(r.remind_at), "d MMM · HH:mm", { locale: es })].filter(Boolean).join(' · ')}
                      chevron
                    />
                  ))}
                </RowList>
              </Section>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-3xl" />)}
          </div>
        ) : (trips?.length ?? 0) === 0 ? (
          <Empty
            icon={MapPin}
            title="Tu primera aventura te espera"
            description="Crea un viaje y tendrás en un solo sitio el plan de cada día, los billetes, los gastos y una guía del destino."
            className="py-16"
          >
            <Button variant="primary" size="lg" disabled={!!bloqueoCrear} onClick={() => openTripForm()}>
              <Plus /> Crear mi primer viaje
            </Button>
            <Button variant="outline" size="lg" loading={seeding} onClick={createExample}>
              <Sparkles /> Probar con un ejemplo
            </Button>
          </Empty>
        ) : (
          <Stack>
            <div className="space-y-3">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, destino o etiqueta"
                  aria-label="Buscar viajes" className="rounded-full pl-10"
                />
              </div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filtrar por estado">
                <Chip selected={statusFilter === 'all'} count={trips!.length} onClick={() => setStatusFilter('all')}>Todos</Chip>
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = trips!.filter(t => effectiveStatus(t) === key).length
                  if (!count) return null
                  return (
                    <Chip key={key} selected={statusFilter === key} count={count} onClick={() => setStatusFilter(p => p === key ? 'all' : key)}>
                      {label}
                    </Chip>
                  )
                })}
              </div>
            </div>

            {filtered.length === 0 ? (
              <Empty icon={Search} title="Ningún viaje coincide" description="Prueba con otra palabra o quita el filtro.">
                <Button onClick={() => { setSearch(''); setStatusFilter('all') }}>Ver todos los viajes</Button>
              </Empty>
            ) : filtering ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {filtered.map(t => <TripCard key={t.id} trip={t} {...cardProps} />)}
              </div>
            ) : (
              GROUPS.map(g => {
                const items = filtered.filter(t => g.match(effectiveStatus(t)))
                if (!items.length) return null
                // Los pasados, del más reciente al más antiguo.
                const ordered = g.key === 'past' ? [...items].reverse() : items
                return (
                  <Section key={g.key} title={g.title}>
                    {g.key === 'now' ? (
                      <div className="grid gap-5">
                        {ordered.map(t => <TripCard key={t.id} trip={t} featured {...cardProps} />)}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                        {ordered.map(t => <TripCard key={t.id} trip={t} {...cardProps} />)}
                      </div>
                    )}
                  </Section>
                )
              })
            )}
          </Stack>
        )}
      </Stack>

      <Confirm
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        danger
        {...deleteTripCopy(deleteTarget?.name ?? '')}
        onConfirm={() => {
          if (deleteTarget) deleteTrip.mutate(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
      <OnboardingWelcome open={showWelcome} onClose={closeWelcome} />
    </Page>
  )
}
