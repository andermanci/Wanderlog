import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ChevronDown, Download, Landmark, Plus } from 'lucide-react'
import { Button, Confirm, Menu, Page, Panel, Segmented, Skeleton, Stack } from '@/design'
import { useCreateExpense, useDeleteExpense, useExpenses, type PendingExpense } from '@/lib/queries/expenses'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { sumConverted, useExchangeRates } from '@/lib/queries/rates'
import { useConnectRevolut, useRevolutConnection } from '@/lib/queries/revolut'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { useTravelers } from '@/lib/queries/travelers'
import { useTrip } from '@/lib/queries/trips'
import { sumByCurrency } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { Activity } from '@/types/database'
import { BudgetHero } from './BudgetHero'
import { CurrencyConverter } from './Currency'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseList } from './ExpenseList'
import { ItineraryPrices } from './ItineraryPrices'
import { QuickExpense } from './QuickExpense'
import { RevolutImportPanel } from './RevolutImportPanel'
import { SplitView } from './SplitView'
import { SummaryView } from './SummaryView'
import { expenseCategoryFor, today } from './categories'

type View = 'lista' | 'reparto' | 'resumen'
type PanelKind = 'gasto' | 'conversor' | 'revolut'

export function ExpensesPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { profile } = useAuthStore()
  const { data: trip } = useTrip(tripId)
  const { data: expenses, isLoading } = useExpenses(tripId)
  const { data: activities } = useActivities(tripId)
  const { data: days } = useItineraryDays(tripId)
  const { data: travelerData } = useTravelers(tripId)
  const { data: role } = useTripRole(tripId)
  const { data: connection } = useRevolutConnection(tripId)
  const connectRevolut = useConnectRevolut(tripId)
  const createExpense = useCreateExpense()
  const deleteExpense = useDeleteExpense()
  const canEdit = canEditRole(role)

  const all: PendingExpense[] = expenses ?? []
  const travelers = travelerData ?? []

  // Los gastos se APUNTAN en la divisa del viaje; los totales se enseñan en la
  // divisa principal de la persona, convirtiendo con el cambio del día.
  const tripCurrency = trip?.default_currency || profile?.default_currency || 'EUR'
  const mainCurrency = profile?.default_currency ?? 'EUR'
  const { data: rates } = useExchangeRates(mainCurrency)
  const { total, missing } = sumConverted(all, mainCurrency, rates)
  const otherTotals = Object.entries(sumByCurrency(all)).filter(([c]) => c !== mainCurrency)

  const [view, setView] = useState<View>('lista')
  // Un solo panel a la vez. `opens` cambia en cada apertura y sirve de `key`:
  // el formulario y el importador arrancan limpios sin efectos de «reset».
  const [panel, setPanel] = useState<PanelKind | null>(null)
  const [opens, setOpens] = useState(0)
  const [editing, setEditing] = useState<PendingExpense | null>(null)
  const [toDelete, setToDelete] = useState<PendingExpense | null>(null)

  function openPanel(kind: PanelKind, expense: PendingExpense | null = null) {
    setEditing(expense)
    setOpens(n => n + 1)
    setPanel(kind)
  }
  const closeOn = (kind: PanelKind) => (open: boolean) => { if (!open) setPanel(p => (p === kind ? null : p)) }

  // Contratos de entrada: ?nuevo=1 abre el gasto nuevo; ?import=revolut (vuelta
  // del consentimiento del banco) abre la lista de movimientos.
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsNew = searchParams.get('nuevo') === '1'
  const wantsImport = searchParams.get('import') === 'revolut'
  useEffect(() => {
    if (!wantsNew && !wantsImport) return
    // Hasta saber el rol no se decide: quien solo puede mirar no abre el formulario.
    if (role === undefined) return
    if (canEditRole(role)) {
      // Abrir el panel al llegar con el parámetro: es la respuesta a un cambio de la URL.
      /* eslint-disable react-hooks/set-state-in-effect */
      setEditing(null)
      setOpens(n => n + 1)
      setPanel(wantsImport ? 'revolut' : 'gasto')
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    const next = new URLSearchParams(searchParams)
    next.delete('nuevo')
    next.delete('import')
    setSearchParams(next, { replace: true })
  }, [wantsNew, wantsImport, role, searchParams, setSearchParams])

  // El gasto rápido y los precios del itinerario también entran en el reparto:
  // paga «yo» y se divide entre todos. Sin esto no aparecerían en los saldos.
  function defaultSplit(): { paid_by?: string; split_between?: string[] } {
    if (travelers.length < 2) return {}
    return {
      paid_by: travelers.find(t => t.is_self)?.id ?? travelers[0].id,
      split_between: travelers.map(t => t.id),
    }
  }

  // Actividades con precio que aún no son gasto (activity_id evita duplicar).
  const dayDateById = new Map((days ?? []).map(d => [d.id, d.date]))
  const linked = new Set(all.map(e => e.activity_id).filter(Boolean))
  const pendingActs = (activities ?? []).filter(a => a.price != null && a.price > 0 && !linked.has(a.id))

  function addActivityExpense(a: Activity) {
    createExpense.mutate({
      trip_id: tripId,
      activity_id: a.id,
      description: a.title,
      category: expenseCategoryFor(a.type),
      amount: a.price ?? 0,
      currency: tripCurrency,
      date: dayDateById.get(a.day_id) ?? today(),
      ...defaultSplit(),
    })
  }

  return (
    <Page
      title="Gastos"
      subtitle="Cuánto lleváis gastado y cómo repartirlo."
      actions={(
        <>
          <Menu
            align="end"
            trigger={<Button variant="outline">Más <ChevronDown aria-hidden="true" /></Button>}
            items={[
              { label: 'Conversor', icon: ArrowLeftRight, hint: 'Pasa un importe de una divisa a otra', onSelect: () => openPanel('conversor') },
              canEdit && !connection && {
                label: 'Conectar Revolut', icon: Landmark, hint: 'Para traer tus pagos sin apuntarlos a mano',
                disabled: connectRevolut.isPending, separated: true, onSelect: () => connectRevolut.mutate(),
              },
              canEdit && !!connection && {
                label: 'Importar movimientos', icon: Download, hint: 'Elige qué pagos de Revolut son gastos del viaje',
                separated: true, onSelect: () => openPanel('revolut'),
              },
            ]}
          />
          {canEdit && (
            <Button variant="primary" onClick={() => openPanel('gasto')}>
              <Plus aria-hidden="true" /> Nuevo gasto
            </Button>
          )}
        </>
      )}
    >
      <Stack>
        <BudgetHero
          total={total}
          budget={trip?.budget_total ?? 0}
          currency={mainCurrency}
          otherTotals={otherTotals}
          missing={missing}
          count={all.length}
          expenses={all}
          rates={rates}
        />

        {canEdit && (
          <QuickExpense
            currency={tripCurrency}
            saving={createExpense.isPending}
            onAdd={({ amount, description, category }) => createExpense.mutate({
              trip_id: tripId, description, category, amount,
              currency: tripCurrency, date: today(), ...defaultSplit(),
            })}
          />
        )}

        {canEdit && pendingActs.length > 0 && (
          <ItineraryPrices
            activities={pendingActs}
            currency={tripCurrency}
            saving={createExpense.isPending}
            onAdd={addActivityExpense}
            onAddAll={() => pendingActs.forEach(addActivityExpense)}
          />
        )}

        <div className="space-y-4">
          <Segmented
            label="Vista de los gastos"
            value={view}
            onChange={setView}
            block
            className="sm:inline-flex sm:w-auto"
            options={[
              { value: 'lista', label: 'Lista' },
              { value: 'reparto', label: 'Reparto' },
              { value: 'resumen', label: 'Resumen' },
            ]}
          />

          {isLoading ? (
            <div className="space-y-px">
              <Skeleton className="mb-3 h-10 w-44" />
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-md" />)}
            </div>
          ) : view === 'lista' ? (
            <ExpenseList
              expenses={all}
              travelers={travelers}
              currency={mainCurrency}
              rates={rates}
              canEdit={canEdit}
              onEdit={e => openPanel('gasto', e)}
              onDelete={setToDelete}
            />
          ) : view === 'reparto' ? (
            <SplitView
              tripId={tripId}
              expenses={all}
              travelers={travelers}
              currency={mainCurrency}
              rates={rates}
              canEdit={canEdit}
            />
          ) : (
            <SummaryView expenses={all} currency={mainCurrency} rates={rates} total={total} />
          )}
        </div>
      </Stack>

      <ExpenseForm
        key={`gasto-${opens}`}
        open={panel === 'gasto'}
        onOpenChange={closeOn('gasto')}
        tripId={tripId}
        editing={editing}
        travelers={travelers}
        defaultCurrency={tripCurrency}
      />

      <Panel
        open={panel === 'conversor'}
        onOpenChange={closeOn('conversor')}
        title="Conversor"
        description="Para saber al momento cuánto es un precio en tu divisa."
      >
        <CurrencyConverter key={`conversor-${opens}`} defaultFrom={tripCurrency} defaultTo={mainCurrency} />
      </Panel>

      <RevolutImportPanel
        key={`revolut-${opens}`}
        open={panel === 'revolut'}
        onOpenChange={closeOn('revolut')}
        tripId={tripId}
      />

      <Confirm
        danger
        open={!!toDelete}
        onOpenChange={open => { if (!open) setToDelete(null) }}
        title="¿Eliminar este gasto?"
        description={toDelete ? `«${toDelete.description}» se borrará del viaje y de las cuentas. No se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (toDelete) deleteExpense.mutate({ id: toDelete.id, tripId })
          setToDelete(null)
        }}
      />
    </Page>
  )
}
