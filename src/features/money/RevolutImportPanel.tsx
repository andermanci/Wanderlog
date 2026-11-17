import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button, Checkbox, Empty, Notice, Panel, Spinner } from '@/design'
import { useImportRevolut, usePreviewRevolut, type RevolutCandidate } from '@/lib/queries/revolut'
import { formatCurrency, formatDate } from '@/lib/utils'

interface RevolutImportPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
}

/**
 * Elegir qué movimientos de Revolut pasan a ser gastos. El padre lo remonta con
 * `key` cada vez que lo abre: al montarse abierto, lee los movimientos.
 */
export function RevolutImportPanel({ open, onOpenChange, tripId }: RevolutImportPanelProps) {
  const preview = usePreviewRevolut(tripId)
  const importMut = useImportRevolut(tripId)
  // null = la selección propuesta (los del viaje que aún no están importados).
  const [picked, setPicked] = useState<Set<string> | null>(null)

  const readMovements = preview.mutate
  useEffect(() => {
    if (open) readMovements()
  }, [open, readMovements])

  const candidates = preview.data?.candidates ?? []
  const waiting = preview.data?.pending === true
  const loading = preview.isPending || preview.isIdle
  const selected = picked
    ?? new Set(candidates.filter(c => c.inTripRange && !c.alreadyImported).map(c => c.external_id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setPicked(next)
  }

  const duringTrip = candidates.filter(c => c.inTripRange)
  const beforeTrip = candidates.filter(c => !c.inTripRange)

  function group(title: string, items: RevolutCandidate[]) {
    if (items.length === 0) return null
    return (
      <section>
        <h3 className="eyebrow mb-1">{title}</h3>
        <ul className="divide-y divide-border">
          {items.map(c => {
            const id = `mov-${c.external_id}`
            return (
              <li key={c.external_id} className="flex min-h-15 items-center gap-3 py-2.5">
                <Checkbox
                  id={id}
                  checked={c.alreadyImported || selected.has(c.external_id)}
                  disabled={c.alreadyImported}
                  onCheckedChange={() => toggle(c.external_id)}
                />
                <label htmlFor={id} className={c.alreadyImported ? 'min-w-0 flex-1' : 'min-w-0 flex-1 cursor-pointer'}>
                  <span className="block truncate text-[0.9375rem] font-medium">{c.description}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatDate(c.date)}{c.alreadyImported && ' · Ya importado'}
                  </span>
                </label>
                <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums">
                  {formatCurrency(c.amount, c.currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title="Importar movimientos"
      description="Marca los movimientos de Revolut que quieras apuntar como gastos."
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="primary"
            loading={importMut.isPending}
            disabled={loading || waiting || selected.size === 0}
            onClick={() => importMut.mutate([...selected], { onSuccess: () => onOpenChange(false) })}
          >
            {selected.size > 0 ? `Importar ${selected.size}` : 'Importar'}
          </Button>
        </>
      )}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
          <Spinner className="size-7" label="Leyendo tus movimientos" />
          <p className="text-[0.9375rem]">Leyendo tus movimientos…</p>
        </div>
      ) : preview.isError ? (
        <Notice tone="danger" title="No se han podido leer los movimientos" action={(
          <Button variant="outline" size="sm" onClick={() => readMovements()}>Reintentar</Button>
        )}>
          Comprueba la conexión y vuelve a intentarlo.
        </Notice>
      ) : waiting ? (
        <Empty
          bare
          icon={Landmark}
          title="La conexión sigue pendiente"
          description="Termina de dar permiso en Revolut y vuelve a abrir esta lista."
        />
      ) : candidates.length === 0 ? (
        <Empty
          bare
          icon={Landmark}
          title="No hay movimientos"
          description="No se ha encontrado ningún movimiento en esas fechas."
        />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Los del viaje ya vienen marcados. Marca también las reservas que pagaste antes (hoteles, vuelos…).
          </p>
          {group('Durante el viaje', duringTrip)}
          {group('Reservas anteriores al viaje', beforeTrip)}
        </div>
      )}
    </Panel>
  )
}
