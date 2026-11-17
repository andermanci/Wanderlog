import { Coins, Languages, Phone, Plug, Zap, type LucideIcon } from 'lucide-react'
import { Card } from '@/design'
import type { GuideFacts } from '@/types/database'

/**
 * Datos de referencia del destino: moneda, enchufe, voltaje, idioma y emergencias.
 * El teléfono de emergencias va siempre a la vista y se puede marcar con un toque:
 * el día que hace falta no se busca a tientas.
 */
export function DestinationFacts({ facts, placeName }: { facts?: GuideFacts | null; placeName?: string }) {
  const emergencyDigits = facts?.emergency?.match(/[\d+][\d\s/-]*\d|\d/)?.[0]?.replace(/[\s/-]+$/, '')
  const items: { icon: LucideIcon; label: string; value: string }[] = []
  if (facts?.currency) items.push({ icon: Coins, label: 'Moneda', value: facts.currency })
  if (facts?.plug) items.push({ icon: Plug, label: 'Enchufe', value: facts.plug })
  if (facts?.voltage) items.push({ icon: Zap, label: 'Voltaje', value: facts.voltage })
  if (facts?.languages) items.push({ icon: Languages, label: 'Idioma', value: facts.languages })

  if (!facts?.emergency && items.length === 0) return null

  return (
    <Card pad="sm" sunken className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{placeName ? `Datos de ${placeName}` : 'Datos del destino'}</p>
        {facts?.emergency && (
          emergencyDigits ? (
            <a
              href={`tel:${emergencyDigits.replace(/[\s/-]/g, '')}`}
              data-tone="danger"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tone-line bg-tone-soft px-3.5 text-sm font-semibold"
            >
              <Phone className="size-4 text-tone" aria-hidden="true" /> Emergencias: {emergencyDigits}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Phone className="size-4 text-destructive" aria-hidden="true" /> Emergencias: <strong>{facts.emergency}</strong>
            </span>
          )
        )}
      </div>
      {items.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" /> {label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}
