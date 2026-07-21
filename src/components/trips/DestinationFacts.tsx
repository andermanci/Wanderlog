import { useState } from 'react'
import { ChevronDown, Coins, Info, Languages, Phone, Plug, Zap } from 'lucide-react'
import type { GuideFacts } from '@/types/database'

// Datos de referencia del destino: moneda, enchufe, voltaje, idioma y
// emergencias. Son cosas que se consultan una vez por viaje, no cada vez que
// abres la app, así que van plegadas al pie de la tarjeta de Hoy en lugar de
// ocupar tres filas de píldoras entre el plan del día y los accesos rápidos.
//
// El teléfono de emergencias es la excepción: se queda siempre visible en la
// cabecera del desplegable, porque el día que hace falta no se busca a tientas.
export function DestinationFacts({ facts, placeName }: {
  facts?: GuideFacts | null
  /** Nombre de la ciudad, para titular el desplegable. */
  placeName?: string
}) {
  const [open, setOpen] = useState(false)

  const emergencyDigits = facts?.emergency?.match(/[\d+][\d\s/-]*\d|\d/)?.[0]?.replace(/[\s/-]+$/, '')
  const pills: { key: string; icon: typeof Coins; label: string; value: string }[] = []
  if (facts?.currency) pills.push({ key: 'currency', icon: Coins, label: 'Moneda', value: facts.currency })
  if (facts?.plug) pills.push({ key: 'plug', icon: Plug, label: 'Enchufe', value: facts.plug })
  if (facts?.voltage) pills.push({ key: 'voltage', icon: Zap, label: 'Voltaje', value: facts.voltage })
  if (facts?.languages) pills.push({ key: 'languages', icon: Languages, label: 'Idioma', value: facts.languages })

  if (!facts?.emergency && pills.length === 0) return null

  const title = placeName ? `Datos de ${placeName}` : 'Datos del destino'

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)' }}>
      <div className="flex items-center gap-2">
        {pills.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Info size={13} aria-hidden="true" />
            {title}
            <ChevronDown size={13} aria-hidden="true"
              className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info size={13} aria-hidden="true" />
            {title}
          </span>
        )}

        <span className="flex-1" />

        {facts?.emergency && (
          emergencyDigits ? (
            <a href={`tel:${emergencyDigits.replace(/[\s/-]/g, '')}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors hover:brightness-110 flex-shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--destructive) 10%, var(--secondary))',
                borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)',
              }}>
              <Phone size={12} style={{ color: 'var(--destructive)' }} aria-hidden="true" />
              <span className="text-muted-foreground">Emergencias</span>
              <span className="font-semibold">{emergencyDigits}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border flex-shrink-0"
              style={{ background: 'var(--secondary)' }}>
              <Phone size={12} style={{ color: 'var(--destructive)' }} aria-hidden="true" />
              <span className="text-muted-foreground">Emergencias</span>
              <span className="font-medium">{facts.emergency}</span>
            </span>
          )
        )}
      </div>

      {open && pills.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
          {pills.map(({ key, icon: Icon, label, value }) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <Icon size={13} style={{ color: 'var(--primary)' }} aria-hidden="true" />
              <dt className="text-muted-foreground">{label}:</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
