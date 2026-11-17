import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Armchair, ArrowLeft, ArrowRight, Check, Copy, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, DocIcon, IconButton } from '@/design'
import { DOCUMENT_LABELS, formatDate } from '@/lib/utils'
import type { WalletPass } from '@/lib/wallet/pass'
import { useWalletPassStore } from '@/store/walletPassStore'
import { FileView, OpenFileLink } from './FileViewer'
import { WalletCode } from './WalletCode'
import { toneOf, type FileRef } from './shared'

/** Mantiene la pantalla encendida mientras se enseña el código (si el navegador lo permite). */
function useKeepScreenOn(active: boolean) {
  useEffect(() => {
    if (!active) return
    let released = false
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock?.request('screen')
      .then(sentinel => { if (released) void sentinel.release(); else lock = sentinel })
      .catch(() => {})
    return () => {
      released = true
      void lock?.release().catch(() => {})
    }
  }, [active])
}

// Localizador o n.º de confirmación, en grande y copiable de un toque.
function CodeText({ label, value }: { label: string | null; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3">
      <div className="min-w-0">
        {label && <p className="eyebrow">{label}</p>}
        <p className="truncate font-mono text-2xl font-semibold tracking-wider">{value}</p>
      </div>
      <Button variant="outline" size="sm" className="h-11" onClick={copy} aria-live="polite">
        {copied ? <Check /> : <Copy />} {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  )
}

function PassView({ pass, onClose }: { pass: WalletPass; onClose: () => void }) {
  // El billete entero se abre aquí mismo, en lugar del código, sin otra ventana encima.
  const [showFile, setShowFile] = useState(false)
  const rawDate = pass.start ? formatDate(pass.start, pass.start.length > 10 ? 'EEE d MMM · HH:mm' : 'EEE d MMM') : null
  const date = rawDate && rawDate !== '—' ? rawDate : null
  const file: FileRef | null = pass.attachment
    ? { url: pass.attachment.value, name: pass.attachment.name, mime: pass.attachment.isPdf ? 'application/pdf' : null }
    : null

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-5">
        {showFile ? (
          <IconButton label="Volver al código" variant="secondary" onClick={() => setShowFile(false)}><ArrowLeft /></IconButton>
        ) : (
          <span data-tone={toneOf(pass.category)} className="grid size-11 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
            <DocIcon category={pass.category} className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Dialog.Title className="title-section truncate">{pass.title}</Dialog.Title>
          <Dialog.Description className="truncate text-sm text-muted-foreground">
            {showFile ? 'Documento completo' : `${DOCUMENT_LABELS[pass.category] ?? 'Reserva'}${date ? ` · ${date}` : ''}`}
          </Dialog.Description>
        </div>
        <IconButton label="Cerrar" variant="secondary" onClick={onClose}><X /></IconButton>
      </header>

      {showFile && file ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 md:px-6">
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-white">
            <FileView file={file} className={pass.attachment?.isPdf ? 'size-full min-h-[60dvh]' : 'w-full object-contain'} />
          </div>
          <OpenFileLink file={file} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4 md:px-6">
          <WalletCode attachment={pass.attachment} code={pass.code} link={pass.link} />

          {/* Datos clave, justo debajo del código */}
          {(pass.origin || pass.destination || pass.seat) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
              {(pass.origin || pass.destination) && (
                <span className="inline-flex items-center gap-2 font-semibold">
                  {pass.origin ?? '—'}
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  {pass.destination ?? '—'}
                </span>
              )}
              {pass.seat && (
                <span className="inline-flex items-center gap-1.5">
                  <Armchair className="size-4 text-muted-foreground" aria-hidden="true" />
                  Asiento <strong className="font-semibold">{pass.seat}</strong>
                </span>
              )}
            </div>
          )}
          {pass.code && <CodeText label={pass.codeLabel} value={pass.code} />}
          {file && (
            <Button variant="outline" block onClick={() => setShowFile(true)}>
              <FileText /> Ver el documento completo
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Si el lector no lo coge, sube el brillo de la pantalla al máximo.
          </p>
        </div>
      )}

      <footer className="shrink-0 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:pb-5">
        <Button variant="secondary" size="lg" block onClick={onClose}>Cerrar</Button>
      </footer>
    </>
  )
}

// El billete para enseñar en el mostrador: el código enorme sobre blanco, los
// datos clave debajo y un «Cerrar» grande. Pantalla completa en el móvil, tarjeta
// centrada en escritorio. Se monta una sola vez en el armazón y se abre desde
// cualquier pantalla con `useWalletPassStore().openPass(pass)`.
export default function WalletPassModal() {
  const open = useWalletPassStore(s => s.open)
  const pass = useWalletPassStore(s => s.pass)
  const close = useWalletPassStore(s => s.close)
  useKeepScreenOn(open)

  return (
    <Dialog.Root open={open && !!pass} onOpenChange={o => !o && close()}>
      <Dialog.Portal>
        {/* Por encima de paneles, confirmaciones y menús: es lo último que se abre. */}
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-foreground/60 backdrop-blur-[2px] dark:bg-background/80 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Content
          className="fixed inset-0 z-[80] flex flex-col bg-card text-card-foreground outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[calc(100dvh-3rem)] md:w-[32rem] md:max-w-[calc(100vw-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:shadow-float"
        >
          {pass && <PassView key={pass.id} pass={pass} onClose={close} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
