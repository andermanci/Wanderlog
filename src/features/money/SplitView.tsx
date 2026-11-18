import { Link } from 'react-router-dom'
import { ArrowRight, HandCoins, Handshake, UserPlus, Users } from 'lucide-react'
import { Avatar, Button, Empty } from '@/design'
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

/** Vista «Reparto»: cómo quedar en paz (quién paga a quién) y el saldo de cada uno como una balanza. */
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

  // La barra más larga es la del saldo mayor; las demás, en proporción.
  const maxNet = Math.max(...balances.map(b => Math.abs(b.net)), 0.01)

  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
      <section>
        <p className="eyebrow">Cómo quedar en paz</p>
        <h3 className="title-section mt-0.5">
          {settlements.length === 0 ? 'Nadie debe nada' : settlements.length === 1 ? 'Con un pago, en paz' : `Con ${settlements.length} pagos, en paz`}
        </h3>

        {settlements.length === 0 ? (
          <p data-tone="success" className="mt-4 flex items-center gap-3 rounded-2xl bg-tone-soft px-4 py-4 text-[0.9375rem]">
            <Handshake className="size-6 shrink-0 text-tone" aria-hidden="true" />
            Estáis en paz: nadie debe nada a nadie.
          </p>
        ) : (
          <ul className="mt-3 border-t-2 border-foreground/80">
            {settlements.map(s => {
              const from = nameOf(s.from)
              const to = nameOf(s.to)
              return (
                <li key={`${s.from}-${s.to}`} className="border-b border-border py-4">
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={from} size="sm" />
                      <span className="truncate font-serif text-lg font-medium tracking-tight">{from}</span>
                    </span>
                    <ArrowRight className="size-5 shrink-0 text-accent-foreground" aria-hidden="true" />
                    <span className="sr-only">paga a</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={to} size="sm" />
                      <span className="truncate font-serif text-lg font-medium tracking-tight">{to}</span>
                    </span>
                  </p>
                  <p className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight tabular-nums">
                    {formatCurrency(s.amount, currency)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Son los pagos justos para saldar las cuentas, en {currency}.</p>
      </section>

      <section>
        <p className="eyebrow">Saldo de cada uno</p>
        <h3 className="title-section mt-0.5">Quién ha puesto de más y de menos</h3>
        <ul className="mt-3 border-t-2 border-foreground/80">
          {balances.map(b => {
            const name = nameOf(b.travelerId)
            const state = b.net > 0.01 ? 'credit' : b.net < -0.01 ? 'debt' : 'even'
            const width = `${(Math.abs(b.net) / maxNet) * 50}%`
            return (
              <li
                key={b.travelerId}
                data-tone={state === 'credit' ? 'success' : state === 'debt' ? 'danger' : 'neutral'}
                className="border-b border-border py-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-lg font-medium leading-snug tracking-tight">{name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Ha pagado {formatCurrency(b.paid, currency)} · Le tocan {formatCurrency(b.owes, currency)}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="eyebrow block text-tone">
                      {state === 'credit' ? 'Le deben' : state === 'debt' ? 'Debe' : 'En paz'}
                    </span>
                    {state !== 'even' && (
                      <span className="font-serif text-xl font-medium leading-tight tracking-tight text-tone tabular-nums">
                        {formatCurrency(Math.abs(b.net), currency)}
                      </span>
                    )}
                  </p>
                </div>
                {/* Balanza: desde el centro, a la derecha si le deben y a la izquierda si debe. */}
                <div aria-hidden="true" className="relative mt-3 h-2.5 rounded-full bg-secondary">
                  {state !== 'even' && (
                    <span
                      className={state === 'credit'
                        ? 'absolute inset-y-0 left-1/2 rounded-r-full bg-tone'
                        : 'absolute inset-y-0 right-1/2 rounded-l-full bg-tone'}
                      style={{ width }}
                    />
                  )}
                  <span className="absolute -inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-border-strong" />
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
          <span>← Debe</span><span>Le deben →</span>
        </p>
      </section>
    </div>
  )
}
