import { Link } from 'react-router-dom'
import { ArrowRight, HandCoins, UserPlus, Users } from 'lucide-react'
import { Avatar, Badge, Button, Card, Empty, Row, RowList, Section } from '@/design'
import { computeBalances, settleBalances } from '@/lib/split'
import { formatCurrency } from '@/lib/utils'
import type { Expense, Traveler } from '@/types/database'

interface SplitViewProps {
  tripId: string
  expenses: Expense[]
  travelers: Traveler[]
  /** Divisa principal: todo el reparto se calcula en ella. */
  currency: string
  rates: Record<string, number> | undefined
  canEdit: boolean
}

/** Vista «Reparto»: cuánto ha puesto cada uno y cómo quedar en paz. */
export function SplitView({ tripId, expenses, travelers, currency, rates, canEdit }: SplitViewProps) {
  if (travelers.length < 2) {
    return (
      <Empty
        icon={Users}
        title="Faltan viajeros para repartir"
        description="Para saber quién debe a quién hacen falta al menos dos viajeros. Los viajeros se añaden en Cartera."
      >
        {canEdit && (
          <Button asChild variant="soft">
            <Link to={`/trips/${tripId}/documents?nuevo=1`}><UserPlus aria-hidden="true" /> Añadir viajeros en Cartera</Link>
          </Button>
        )}
      </Empty>
    )
  }

  const balances = computeBalances(expenses, travelers, currency, rates)
  const settlements = settleBalances(balances)
  const nameOf = (id: string) => {
    const t = travelers.find(x => x.id === id)
    return t ? `${t.name}${t.is_self ? ' (yo)' : ''}` : 'Alguien'
  }

  if (balances.length === 0) {
    return (
      <Empty
        icon={HandCoins}
        title="Aún no hay gastos compartidos"
        description="Al apuntar un gasto, indica quién lo pagó y entre quién se reparte. Aquí verás las cuentas."
      />
    )
  }

  return (
    <div className="space-y-8">
      <Section title="Cómo quedar en paz" description={`Los pagos justos para saldar las cuentas, en ${currency}.`}>
        {settlements.length === 0 ? (
          <Card><p className="text-[0.9375rem]">Estáis en paz: nadie debe nada a nadie.</p></Card>
        ) : (
          <RowList>
            {settlements.map(s => (
              <div key={`${s.from}-${s.to}`} className="flex min-h-15 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-[0.9375rem]">
                  <span className="font-semibold">{nameOf(s.from)}</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    paga a <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">{nameOf(s.to)}</span>
                </p>
                <span className="text-base font-semibold text-accent-foreground tabular-nums">
                  {formatCurrency(s.amount, currency)}
                </span>
              </div>
            ))}
          </RowList>
        )}
      </Section>

      <Section title="Saldo de cada uno" description="Lo que ha pagado y lo que le toca de los gastos compartidos.">
        <RowList>
          {balances.map(b => {
            const name = nameOf(b.travelerId)
            return (
              <Row
                key={b.travelerId}
                leading={<Avatar name={name} />}
                title={name}
                subtitle={`Ha pagado ${formatCurrency(b.paid, currency)} · Le tocan ${formatCurrency(b.owes, currency)}`}
                trailing={
                  b.net > 0.01 ? <Badge tone="success">Le deben {formatCurrency(b.net, currency)}</Badge>
                    : b.net < -0.01 ? <Badge tone="danger">Debe {formatCurrency(-b.net, currency)}</Badge>
                      : <Badge>En paz</Badge>
                }
              />
            )
          })}
        </RowList>
      </Section>
    </div>
  )
}
