import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { isPast, parseISO } from 'date-fns'
import { BellPlus, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button, Confirm, Empty, Menu, Page, Skeleton, Stack } from '@/design'
import { TIMELINE_GRID } from '@/features/plan/timeline'
import { useDocuments } from '@/lib/queries/documents'
import { useCreateReminder, useDeleteReminder, useReminders } from '@/lib/queries/reminders'
import { useTrip } from '@/lib/queries/trips'
import { cn } from '@/lib/utils'
import type { Reminder } from '@/types/database'
import { PushBanner } from './PushBanner'
import { ReminderForm } from './ReminderForm'
import { formatWhen, reminderLook, suggestReminders, whenParts, type ReminderSuggestion } from './reminderTypes'

// El mismo raíl que el Plan, con la columna de la izquierda más ancha: aquí lleva el día («Mañana», «19 nov»), no solo la hora.
const REMINDER_TIMELINE = cn(
  'relative [--tl-time:4.5rem] [--tl-rail:2.5rem] md:[--tl-time:5.5rem] md:[--tl-rail:3rem]',
  'before:absolute before:inset-y-3 before:left-[calc(var(--tl-time)+var(--tl-rail)/2)] before:w-px before:bg-border-strong',
)

export function RemindersPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { data: reminderData, isLoading } = useReminders(tripId)
  const { data: trip } = useTrip(tripId)
  const { data: documents } = useDocuments(tripId)
  const createReminder = useCreateReminder()
  const deleteReminder = useDeleteReminder()

  // `opens` cambia en cada apertura y sirve de `key`: el formulario sale vacío.
  const [formOpen, setFormOpen] = useState(false)
  const [opens, setOpens] = useState(0)
  const [toDelete, setToDelete] = useState<Reminder | null>(null)
  // Los avisos pasados van plegados: ya no hay nada que hacer con ellos salvo borrarlos.
  const [showPast, setShowPast] = useState(false)

  function openForm() {
    setOpens(n => n + 1)
    setFormOpen(true)
  }

  // Contrato de entrada: ?nuevo=1 abre «Nuevo aviso» y se quita de la URL.
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsNew = searchParams.get('nuevo') === '1'
  useEffect(() => {
    if (!wantsNew) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setOpens(n => n + 1)
    setFormOpen(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    const next = new URLSearchParams(searchParams)
    next.delete('nuevo')
    setSearchParams(next, { replace: true })
  }, [wantsNew, searchParams, setSearchParams])

  const reminders: Reminder[] = reminderData ?? []
  const pending = reminders.filter(r => !isPast(parseISO(r.remind_at)))
  const past = reminders.filter(r => isPast(parseISO(r.remind_at))).reverse()
  const suggestions = isLoading ? [] : suggestReminders(trip, documents ?? [], reminders)

  function addSuggestion(s: ReminderSuggestion) {
    createReminder.mutate({ trip_id: tripId, activity_id: null, title: s.title, remind_at: s.remind_at, type: s.type })
  }

  // Una parada de la línea de tiempo: cuándo, a la izquierda; el icono sobre el raíl; el aviso, a la derecha.
  const stop = (r: Reminder, dimmed = false) => {
    const look = reminderLook(r.type)
    const Icon = look.icon
    const when = whenParts(r.remind_at)
    return (
      <li key={r.id} data-tone={look.tone} className={cn(TIMELINE_GRID, 'items-start py-2', dimmed && 'opacity-60')}>
        <p className="pr-1 pt-1.5 text-right leading-tight">
          <span className="block text-sm font-semibold first-letter:uppercase">{when.day}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">{when.time}</span>
        </p>
        <div className="flex justify-center pt-1">
          {/* El tono suave es translúcido: va sobre una base opaca que tapa el raíl. */}
          <span className="block rounded-full bg-background ring-4 ring-background">
            <span className="grid size-9 place-items-center rounded-full bg-tone-soft text-tone md:size-10">
              <Icon className="size-[1.125rem] md:size-5" aria-hidden="true" />
            </span>
          </span>
        </div>
        <div className="flex min-w-0 items-start gap-1 border-b border-border pb-3">
          <div className="min-w-0 flex-1 pt-1">
            <p className="eyebrow text-tone">{look.label}</p>
            <p className={cn('mt-0.5 font-serif text-lg font-medium leading-snug tracking-tight break-words', dimmed && 'line-through')}>{r.title}</p>
            <p className="sr-only">{formatWhen(r.remind_at)}</p>
          </div>
          <Menu
            label={`Opciones de ${r.title}`}
            items={[{ label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => setToDelete(r) }]}
          />
        </div>
      </li>
    )
  }

  const next = pending[0]

  return (
    <Page
      title="Avisos"
      subtitle="Recordatorios para que no se te pase nada del viaje."
      back={{ to: `/trips/${tripId}`, label: 'Inicio del viaje' }}
      actions={<Button variant="primary" onClick={openForm}><Plus aria-hidden="true" /> Nuevo aviso</Button>}
    >
      <Stack gap="lg">
        <PushBanner />

        {suggestions.length > 0 && (
          <section>
            <p className="eyebrow">Sugeridos</p>
            <h2 className="title-section mt-0.5">Añádelos con un toque</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map(s => {
                const look = reminderLook(s.type)
                const Icon = look.icon
                return (
                  <li key={`${s.type}-${s.title}`} data-tone={look.tone}>
                    <button
                      type="button"
                      disabled={createReminder.isPending}
                      onClick={() => addSuggestion(s)}
                      aria-label={`Añadir el aviso «${s.title}», ${formatWhen(s.remind_at)}`}
                      className="flex min-h-15 w-full items-center gap-3 rounded-2xl border border-dashed border-tone-line bg-tone-soft px-3.5 py-2.5 text-left transition-[border-color,transform] duration-150 hover:border-tone active:scale-[0.99] disabled:opacity-60"
                    >
                      <Icon className="size-5 shrink-0 text-tone" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium leading-snug line-clamp-2">{s.title}</span>
                        <span className="block text-xs text-muted-foreground first-letter:uppercase">{formatWhen(s.remind_at)}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-tone">
                        <Plus className="size-4" aria-hidden="true" /> Añadir
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-md" />)}
          </div>
        ) : reminders.length === 0 ? suggestions.length > 0 ? null : (
          <Empty
            icon={BellPlus}
            title="Aún no tienes avisos"
            description="Crea uno para acordarte de facturar, de salir hacia el aeropuerto o de una reserva."
          >
            <Button variant="soft" onClick={openForm}><Plus aria-hidden="true" /> Nuevo aviso</Button>
          </Empty>
        ) : (
          <>
            {pending.length > 0 ? (
              <section>
                <p className="eyebrow">El próximo</p>
                <h2 className="title-page first-letter:uppercase">{whenParts(next.remind_at).day}, a las {whenParts(next.remind_at).time}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pending.length === 1 ? 'Tienes 1 aviso pendiente.' : `Tienes ${pending.length} avisos pendientes.`} Te avisaremos a la hora indicada.
                </p>
                <ul className={cn(REMINDER_TIMELINE, 'mt-4')}>{pending.map(r => stop(r))}</ul>
              </section>
            ) : (
              <p className="text-[0.9375rem] text-muted-foreground">No tienes avisos pendientes.</p>
            )}

            {past.length > 0 && (
              <section className="border-t border-border pt-2">
                <Button variant="ghost" aria-expanded={showPast} onClick={() => setShowPast(v => !v)} className="-ml-3">
                  <ChevronDown className={cn('transition-transform duration-200', !showPast && '-rotate-90')} aria-hidden="true" />
                  {past.length === 1 ? '1 aviso pasado' : `${past.length} avisos pasados`}
                </Button>
                {showPast && (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">Su hora ya llegó. Puedes eliminarlos.</p>
                    <ul className={cn(REMINDER_TIMELINE, 'mt-3')}>{past.map(r => stop(r, true))}</ul>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </Stack>

      <ReminderForm key={`aviso-${opens}`} open={formOpen} onOpenChange={setFormOpen} tripId={tripId} />

      <Confirm
        danger
        open={!!toDelete}
        onOpenChange={open => { if (!open) setToDelete(null) }}
        title="¿Eliminar este aviso?"
        description={toDelete ? `«${toDelete.title}» dejará de avisarte. No se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (toDelete) deleteReminder.mutate({ id: toDelete.id, tripId })
          setToDelete(null)
        }}
      />
    </Page>
  )
}
