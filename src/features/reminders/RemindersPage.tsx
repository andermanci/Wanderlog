import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { isPast, parseISO } from 'date-fns'
import { BellPlus, Plus, Trash2 } from 'lucide-react'
import { Button, Confirm, Empty, Menu, Page, Row, RowList, Section, Skeleton, Stack } from '@/design'
import { useDocuments } from '@/lib/queries/documents'
import { useCreateReminder, useDeleteReminder, useReminders } from '@/lib/queries/reminders'
import { useTrip } from '@/lib/queries/trips'
import type { Reminder } from '@/types/database'
import { PushBanner } from './PushBanner'
import { ReminderForm } from './ReminderForm'
import { formatWhen, reminderLook, suggestReminders, type ReminderSuggestion } from './reminderTypes'

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

  const row = (r: Reminder) => {
    const look = reminderLook(r.type)
    return (
      <Row
        key={r.id}
        icon={look.icon}
        tone={look.tone}
        title={r.title}
        subtitle={`${formatWhen(r.remind_at)} · ${look.label}`}
        after={(
          <Menu
            label={`Opciones de ${r.title}`}
            items={[{ label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => setToDelete(r) }]}
          />
        )}
      />
    )
  }

  return (
    <Page
      title="Avisos"
      subtitle="Recordatorios para que no se te pase nada del viaje."
      back={{ to: `/trips/${tripId}`, label: 'Inicio del viaje' }}
      actions={<Button variant="primary" onClick={openForm}><Plus aria-hidden="true" /> Nuevo aviso</Button>}
    >
      <Stack>
        <PushBanner />

        {suggestions.length > 0 && (
          <Section title="Avisos sugeridos" description="Los hemos preparado con las fechas del viaje. Añade los que quieras con un toque.">
            <RowList>
              {suggestions.map(s => {
                const look = reminderLook(s.type)
                return (
                  <Row
                    key={`${s.type}-${s.title}`}
                    icon={look.icon}
                    tone={look.tone}
                    title={s.title}
                    subtitle={formatWhen(s.remind_at)}
                    after={(
                      <Button
                        variant="soft" size="sm"
                        disabled={createReminder.isPending}
                        onClick={() => addSuggestion(s)}
                        aria-label={`Añadir el aviso «${s.title}»`}
                      >
                        <Plus aria-hidden="true" /> Añadir
                      </Button>
                    )}
                  />
                )
              })}
            </RowList>
          </Section>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-15" />)}
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
            {pending.length > 0 && (
              <Section title="Pendientes" description="Te avisaremos a la hora indicada.">
                <RowList>{pending.map(row)}</RowList>
              </Section>
            )}
            {past.length > 0 && (
              <Section title="Pasados" description="Su hora ya llegó. Puedes eliminarlos.">
                <RowList className="bg-sunken shadow-none">{past.map(row)}</RowList>
              </Section>
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
