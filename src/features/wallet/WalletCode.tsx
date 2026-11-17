import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronLeft, ChevronRight, FileText, ScanLine } from 'lucide-react'
import { Badge, IconButton, Spinner } from '@/design'
import { useDocUrl } from '@/lib/docCache'
import { detectCode, type DetectedCode } from '@/lib/wallet/detectCode'
import type { WalletPass } from '@/lib/wallet/pass'

type Attachment = NonNullable<WalletPass['attachment']>

/** Busca los códigos (QR, barras…) dentro del billete adjunto. `null` mientras busca. */
function useDetectedCodes(attachment: Attachment | null, url: string | null): DetectedCode[] | null {
  const [found, setFound] = useState<{ key: string; codes: DetectedCode[] } | null>(null)
  const key = attachment?.value ?? null
  const isPdf = attachment?.isPdf ?? false

  useEffect(() => {
    if (!key || !url) return
    let cancelled = false
    detectCode(key, url, isPdf)
      .then(codes => { if (!cancelled) setFound({ key, codes }) })
      .catch(() => { if (!cancelled) setFound({ key, codes: [] }) })
    return () => { cancelled = true }
  }, [key, url, isPdf])

  if (!key) return []
  return found?.key === key ? found.codes : null
}

// La caja blanca donde va el código. Blanca SIEMPRE, también en modo oscuro: es
// lo que lee el escáner del mostrador, y necesita todo el contraste posible.
const BOX = 'grid w-full place-items-center rounded-3xl bg-white p-4 shadow-card md:p-6'
const CODE_IMG = 'max-h-[58dvh] w-full object-contain'

interface WalletCodeProps {
  /** Billete adjunto (imagen o PDF) donde vive el código escaneable de verdad. */
  attachment: Attachment | null
  /** Localizador o n.º de confirmación, para generar un QR de referencia. */
  code: string | null
  /** Enlace de la reserva: de él sale el QR si no hay localizador. */
  link: string | null
}

// El código de una reserva, lo más grande posible. Por orden de preferencia:
//  1. Billete adjunto → se buscan los códigos dentro y se enseñan recortados.
//  2. Si no se encuentra ninguno → el billete entero (sigue pudiéndose escanear).
//  3. Sin adjunto pero con localizador → un QR generado (de referencia).
export function WalletCode({ attachment, code, link }: WalletCodeProps) {
  const url = useDocUrl(attachment?.value)
  const codes = useDetectedCodes(attachment, url)
  const [index, setIndex] = useState(0)

  if (attachment) {
    if (!url || codes === null) {
      return (
        <div className="grid aspect-square w-full place-items-center rounded-3xl bg-sunken">
          <span className="flex flex-col items-center gap-3 text-[0.9375rem] text-muted-foreground">
            <Spinner label="Buscando el código" />
            Buscando el código en el billete…
          </span>
        </div>
      )
    }

    if (codes.length > 0) {
      const i = Math.min(index, codes.length - 1)
      const current = codes[i]
      const many = codes.length > 1
      return (
        <div className="space-y-3">
          <div className={BOX}>
            <img src={current.cropDataUrl} alt={`${current.label} de ${attachment.name}`} className={CODE_IMG} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Badge tone="primary" icon={ScanLine}>{current.label}</Badge>
            {/* Un billete puede llevar varios códigos: uno por viajero. */}
            {many && (
              <div className="flex items-center gap-2">
                <IconButton label="Código anterior" variant="secondary" onClick={() => setIndex((i - 1 + codes.length) % codes.length)}>
                  <ChevronLeft />
                </IconButton>
                <span className="min-w-12 text-center text-[0.9375rem] font-semibold tabular-nums" aria-live="polite">
                  {i + 1} de {codes.length}
                </span>
                <IconButton label="Código siguiente" variant="secondary" onClick={() => setIndex((i + 1) % codes.length)}>
                  <ChevronRight />
                </IconButton>
              </div>
            )}
          </div>
        </div>
      )
    }

    // No se ha encontrado ningún código: se enseña el billete tal cual.
    return attachment.isPdf ? (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-3xl bg-sunken px-6 text-center">
        <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-[0.9375rem] text-muted-foreground">
          No hemos encontrado un código en este PDF. Ábrelo entero con el botón de abajo.
        </p>
      </div>
    ) : (
      <div className={BOX}>
        <img src={url} alt={attachment.name} className={CODE_IMG} />
      </div>
    )
  }

  // Sin adjunto: QR generado a partir del localizador (o del enlace).
  const value = code ?? link
  if (!value) return null
  return (
    <div className="space-y-3">
      <div className={BOX}>
        <QRCodeSVG value={value} size={512} marginSize={2} className="h-auto w-full max-w-sm" title={`Código QR de ${value}`} />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Es un código de referencia hecho con tu localizador. Puede que no sirva en puertas de embarque o accesos que piden el billete original.
      </p>
    </div>
  )
}
