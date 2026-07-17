import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, ScanLine, FileText, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocUrl } from '@/lib/docCache'
import { detectCode, type DetectedCode } from '@/lib/wallet/detectCode'

export interface WalletAttachment {
  /** Valor guardado en BD: path del bucket privado o URL pública del adjunto. */
  value: string
  isPdf: boolean
  name: string
}

interface WalletCodeProps {
  /** Billete adjunto (imagen/PDF) donde vive el código escaneable de verdad. */
  attachment: WalletAttachment | null
  /** Localizador / nº de confirmación, para generar un QR de referencia. */
  code: string | null
  /** Enlace de la reserva (fallback del QR si no hay localizador). */
  link: string | null
  /** Abrir el billete a pantalla completa. */
  onOpenAttachment: (value: string, name: string) => void
}

// Botón de ancho completo para abrir el billete/documento adjunto entero.
function OpenFullButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      style={{ background: 'var(--secondary)' }}>
      <FileText size={13} /> {label}
    </button>
  )
}

// Muestra el "código" de una reserva con esta prioridad:
//  1. Billete adjunto → detectamos el/los QR dentro y los enseñamos recortados.
//  2. Si no se detecta → miniatura del billete completo (sigue siendo escaneable).
//  3. Sin adjunto pero con localizador → QR generado (referencia, no escaneable).
export function WalletCode({ attachment, code, link, onOpenAttachment }: WalletCodeProps) {
  const resolvedUrl = useDocUrl(attachment?.value)
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectedCode[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!attachment || !resolvedUrl) return
    let cancelled = false
    setDetecting(true)
    setDetected([])
    setIdx(0)
    detectCode(attachment.value, resolvedUrl, attachment.isPdf)
      .then(res => { if (!cancelled) setDetected(res) })
      .finally(() => { if (!cancelled) setDetecting(false) })
    return () => { cancelled = true }
  }, [attachment, resolvedUrl])

  // ---- Con billete adjunto ----
  if (attachment) {
    const open = () => onOpenAttachment(attachment.value, attachment.name)

    if (!resolvedUrl || detecting) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl aspect-[4/3] w-full"
          style={{ background: 'var(--secondary)' }}>
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Leyendo el billete…</span>
        </div>
      )
    }

    if (detected.length > 0) {
      const multi = detected.length > 1
      const cur = detected[Math.min(idx, detected.length - 1)]
      return (
        <div className="w-full">
          <button type="button" onClick={open} className="w-full group text-left block">
            <div className="rounded-xl p-3 bg-white flex items-center justify-center">
              <img src={cur.cropDataUrl} alt={`${cur.label} de ${attachment.name}`}
                className="max-h-52 w-auto max-w-full object-contain" />
            </div>
          </button>

          {/* Paginador cuando el billete lleva varios códigos (uno por viajero) */}
          {multi && (
            <div className="flex items-center justify-center gap-3 mt-2.5">
              <button type="button" aria-label="Código anterior"
                onClick={() => setIdx(i => (i - 1 + detected.length) % detected.length)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                style={{ background: 'var(--secondary)' }}>
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {Math.min(idx, detected.length - 1) + 1} / {detected.length}
              </span>
              <button type="button" aria-label="Código siguiente"
                onClick={() => setIdx(i => (i + 1) % detected.length)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                style={{ background: 'var(--secondary)' }}>
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
              <ScanLine size={12} /> {cur.label}{multi ? ` · ${detected.length} códigos` : ''}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Maximize2 size={12} /> Toca para ampliar
            </span>
          </div>

          <OpenFullButton label="Ver documento completo" onClick={open} />
        </div>
      )
    }

    // No se detectó código: enseñamos el billete completo tal cual.
    return (
      <button type="button" onClick={open} className="w-full group text-left">
        {attachment.isPdf ? (
          <div className="rounded-xl aspect-[4/3] w-full flex flex-col items-center justify-center gap-2"
            style={{ background: 'var(--secondary)' }}>
            <FileText size={26} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ver billete (PDF)</span>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden bg-white flex items-center justify-center">
            <img src={resolvedUrl} alt={attachment.name}
              className="max-h-52 w-auto max-w-full object-contain" />
          </div>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors mt-2">
          <Maximize2 size={12} /> Ver documento completo
        </span>
      </button>
    )
  }

  // ---- Sin adjunto: QR generado del localizador ----
  const qrValue = code ?? link
  if (qrValue) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-xl p-3 bg-white">
          <QRCodeSVG value={qrValue} size={168} marginSize={2} />
        </div>
        <p className="text-[11px] text-muted-foreground text-center max-w-[220px]">
          Código de referencia. Puede no escanearse en puerta de embarque o accesos con validación propia.
        </p>
      </div>
    )
  }

  return null
}
