import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowRight, Armchair, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { DocIcon } from '@/components/icons/DocIcon'
import { DocLightbox } from '@/components/documents/DocLightbox'
import { WalletCode } from '@/components/wallet/WalletCode'
import { useWalletPassStore } from '@/store/walletPassStore'
import { formatDate, DOCUMENT_LABELS } from '@/lib/utils'

// Texto del localizador/confirmación, copiable de un toque.
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

// Modal estilo cartera de iOS: la tarjeta del pase sube desde abajo con muelle,
// muestra el QR/código de barras del billete (o uno generado del localizador).
// Se monta una sola vez (AppLayout) y se abre desde cualquier pantalla vía store.
export default function WalletPassModal() {
  const { open, pass, close } = useWalletPassStore()
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)

  // Evitar que la pantalla se atenúe mientras se enseña el código (best-effort;
  // no controla el brillo del dispositivo).
  useEffect(() => {
    if (!open) return
    let released = false
    navigator.wakeLock?.request('screen').then(s => {
      if (released) { void s.release() } else { wakeLock.current = s }
    }).catch(() => {})
    return () => {
      released = true
      void wakeLock.current?.release().catch(() => {})
      wakeLock.current = null
    }
  }, [open])

  const rawDate = pass?.start
    ? formatDate(pass.start, pass.start.length > 10 ? "EEE d MMM · HH:mm" : 'EEE d MMM')
    : null
  const dateLabel = rawDate && rawDate !== '—' ? rawDate : null

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close()}>
        <AnimatePresence>
          {open && pass && (
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                />
              </DialogPrimitive.Overlay>

              <DialogPrimitive.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()}>
                <motion.div
                  className="fixed inset-x-0 bottom-0 z-50 flex justify-center items-end sm:items-center sm:inset-0 outline-none"
                >
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0, bottom: 0.4 }}
                    onDragEnd={(_, info) => { if (info.offset.y > 120) close() }}
                    className="w-full max-w-[380px] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl mx-0 sm:mx-4 mb-0"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                  >
                    {/* Asa de arrastre (móvil) */}
                    <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                      <span className="w-10 h-1.5 rounded-full" style={{ background: 'var(--border)' }} />
                    </div>

                    {/* Cabecera */}
                    <div className="flex items-center gap-3 px-5 pt-3 pb-3"
                      style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', borderBottom: '1px solid var(--border)' }}>
                      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
                        <DocIcon category={pass.category} size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <DialogPrimitive.Title className="font-serif text-lg font-medium leading-tight truncate">
                          {pass.title}
                        </DialogPrimitive.Title>
                        <p className="text-xs text-muted-foreground truncate">
                          {DOCUMENT_LABELS[pass.category] ?? 'Reserva'}{dateLabel ? ` · ${dateLabel}` : ''}
                        </p>
                      </div>
                      <DialogPrimitive.Close
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        style={{ background: 'var(--secondary)' }} aria-label="Cerrar">
                        <X size={16} />
                      </DialogPrimitive.Close>
                    </div>
                    <DialogPrimitive.Description className="sr-only">
                      Código y datos de la reserva {pass.title}
                    </DialogPrimitive.Description>

                    {/* Trayecto / asiento */}
                    {(pass.origin || pass.destination || pass.seat) && (
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-5 pt-3 text-sm">
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

                    {/* Código */}
                    <div className="px-5 py-5 flex items-center justify-center">
                      <div className="w-full max-w-[300px] mx-auto">
                        <WalletCode
                          attachment={pass.attachment}
                          code={pass.code}
                          link={pass.link}
                          onOpenAttachment={(url, name) => setLightbox({ url, name })}
                        />
                      </div>
                    </div>

                    {/* Localizador / confirmación copiable */}
                    {pass.code && (
                      <div className="px-5 pb-5">
                        <CodeText label={pass.codeLabel} value={pass.code} />
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          )}
        </AnimatePresence>
      </DialogPrimitive.Root>

      <DocLightbox
        open={!!lightbox}
        onOpenChange={(o) => !o && setLightbox(null)}
        url={lightbox?.url ?? null}
        name={lightbox?.name ?? ''}
      />
    </>
  )
}
