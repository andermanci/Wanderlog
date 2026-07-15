import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Armchair, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { DocIcon } from '@/components/icons/DocIcon'
import { formatDate, DOCUMENT_LABELS } from '@/lib/utils'
import { WalletCode, type WalletAttachment } from './WalletCode'

export interface WalletPass {
  id: string
  category: string
  title: string
  code: string | null
  codeLabel: string | null
  link: string | null
  start: string | null
  end: string | null
  origin: string | null
  destination: string | null
  seat: string | null
  attachment: WalletAttachment | null
}

function CodeText({ label, value }: { label: string | null; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }
  return (
    <button type="button" onClick={copy}
      className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
      style={{ background: 'var(--secondary)' }}>
      <div className="min-w-0">
        {label && <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>}
        <p className="font-mono text-lg font-semibold tracking-wide truncate">{value}</p>
      </div>
      <span className="flex-shrink-0 text-muted-foreground">
        {copied ? <Check size={16} style={{ color: 'var(--primary)' }} /> : <Copy size={16} />}
      </span>
    </button>
  )
}

interface WalletPassCardProps {
  pass: WalletPass
  index: number
  onOpenAttachment: (value: string, name: string) => void
}

export function WalletPassCard({ pass, index, onOpenAttachment }: WalletPassCardProps) {
  const rawDate = pass.start
    ? formatDate(pass.start, pass.start.length > 10 ? "EEE d MMM · HH:mm" : 'EEE d MMM')
    : null
  const dateLabel = rawDate && rawDate !== '—' ? rawDate : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', borderBottom: '1px solid var(--border)' }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
          <DocIcon category={pass.category} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base font-medium leading-tight truncate">{pass.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {DOCUMENT_LABELS[pass.category] ?? 'Reserva'}{dateLabel ? ` · ${dateLabel}` : ''}
          </p>
        </div>
      </div>

      {/* Trayecto / asiento */}
      {(pass.origin || pass.destination || pass.seat) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-4 pt-3 text-sm">
          {(pass.origin || pass.destination) && (
            <span className="inline-flex items-center gap-1.5 font-medium">
              {pass.origin ?? '—'}
              <ArrowRight size={13} className="text-muted-foreground" />
              {pass.destination ?? '—'}
            </span>
          )}
          {pass.seat && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Armchair size={13} /> {pass.seat}
            </span>
          )}
        </div>
      )}

      {/* Código (recorte detectado / billete / QR) */}
      <div className="px-4 py-4 flex-1 flex items-center justify-center">
        <div className="w-full max-w-[280px] mx-auto">
          <WalletCode
            attachment={pass.attachment}
            code={pass.code}
            link={pass.link}
            onOpenAttachment={onOpenAttachment}
          />
        </div>
      </div>

      {/* Localizador / confirmación en texto grande (copiable) */}
      {pass.code && (
        <div className="px-4 pb-4">
          <CodeText label={pass.codeLabel} value={pass.code} />
        </div>
      )}
    </motion.div>
  )
}
