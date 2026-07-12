import { useEffect, useState } from 'react'
import { Clock3, Coins, Languages, Phone, Plug, Zap } from 'lucide-react'
import type { TodayHourly } from '@/lib/queries/weather'
import type { GuideFacts } from '@/types/database'

// Info útil en la calle: hora local del destino (solo si difiere de la del
// dispositivo) y datos de la guía — emergencias tappable, moneda, enchufe…
export function UsefulInfoCard({ hourly, facts }: {
  hourly?: TodayHourly | null
  facts?: GuideFacts | null
}) {
  const tzDiffers = !!hourly && hourly.utcOffsetSeconds !== -new Date().getTimezoneOffset() * 60
  const [, tick] = useState(0)

  useEffect(() => {
    if (!tzDiffers) return
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [tzDiffers])

  const emergencyDigits = facts?.emergency?.match(/[\d+][\d\s/-]*\d|\d/)?.[0]?.replace(/[\s/-]+$/, '')
  const pills: { key: string; icon: typeof Coins; label: string; value: string }[] = []
  if (facts?.currency) pills.push({ key: 'currency', icon: Coins, label: 'Moneda', value: facts.currency })
  if (facts?.plug) pills.push({ key: 'plug', icon: Plug, label: 'Enchufe', value: facts.plug })
  if (facts?.voltage) pills.push({ key: 'voltage', icon: Zap, label: 'Voltaje', value: facts.voltage })
  if (facts?.languages) pills.push({ key: 'languages', icon: Languages, label: 'Idioma', value: facts.languages })

  if (!tzDiffers && !facts?.emergency && pills.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {tzDiffers && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border" style={{ background: 'var(--secondary)' }}>
          <Clock3 size={13} style={{ color: 'var(--primary)' }} />
          <span className="text-muted-foreground">Hora allí:</span>
          <span className="font-medium tabular-nums">
            {new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: hourly!.timezone }).format(new Date())}
          </span>
        </span>
      )}
      {facts?.emergency && (
        emergencyDigits ? (
          <a href={`tel:${emergencyDigits.replace(/[\s/-]/g, '')}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors hover:brightness-110"
            style={{ background: 'color-mix(in srgb, var(--destructive) 10%, var(--secondary))', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }}>
            <Phone size={13} style={{ color: 'var(--destructive)' }} />
            <span className="text-muted-foreground">Emergencias:</span>
            <span className="font-semibold">{emergencyDigits}</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border" style={{ background: 'var(--secondary)' }}>
            <Phone size={13} style={{ color: 'var(--destructive)' }} />
            <span className="text-muted-foreground">Emergencias:</span>
            <span className="font-medium">{facts.emergency}</span>
          </span>
        )
      )}
      {pills.map(({ key, icon: Icon, label, value }) => (
        <span key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border" style={{ background: 'var(--secondary)' }}>
          <Icon size={13} style={{ color: 'var(--primary)' }} />
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-medium">{value}</span>
        </span>
      ))}
    </div>
  )
}
