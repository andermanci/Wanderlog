import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, X } from 'lucide-react'
import { Button, IconButton, Modal, Segmented } from '@/design'
import { DocImage } from './DocImage'
import type { IdCardRef } from './shared'

type Side = 'front' | 'back'

/**
 * La foto a pantalla completa, sobre negro y entera (sin recortar). Se cierra con
 * la X, con Escape o tocando fuera de la foto. Va en un diálogo propio, por encima
 * del visor, para que «atrás» y Escape cierren solo esta capa.
 */
function FullScreen({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  return (
    <Dialog.Root open={!!src} onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Content
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black outline-none data-[state=open]:animate-overlay-in"
          onClick={onClose}
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Description className="sr-only">Foto a pantalla completa. Toca fuera o pulsa Escape para cerrar.</Dialog.Description>
          {src && (
            <DocImage
              src={src}
              alt={alt}
              className="max-h-dvh max-w-full object-contain"
              fallback={<span className="text-sm text-white/70">Cargando…</span>}
            />
          )}
          <Dialog.Close asChild>
            <IconButton
              label="Cerrar pantalla completa" variant="photo"
              className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]"
            >
              <X />
            </IconButton>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Sides({ card }: { card: IdCardRef }) {
  const [side, setSide] = useState<Side>('front')
  const [full, setFull] = useState(false)
  const src = side === 'front' ? card.front : card.back
  const name = side === 'front' ? 'Anverso' : 'Reverso'
  return (
    <div className="space-y-4">
      {card.back && (
        <Segmented<Side>
          block
          label="Cara del documento"
          value={side}
          onChange={setSide}
          options={[{ value: 'front', label: 'Anverso' }, { value: 'back', label: 'Reverso' }]}
        />
      )}
      {/* La foto entera, al tamaño que permita la pantalla: sin caja de proporción
          fija que la encoja. Tocarla la abre a pantalla completa. */}
      <button
        type="button"
        disabled={!src}
        onClick={() => setFull(true)}
        title={src ? 'Ver a pantalla completa' : undefined}
        className="grid min-h-48 w-full place-items-center overflow-hidden rounded-xl bg-sunken enabled:cursor-zoom-in"
      >
        <DocImage
          key={side}
          src={src}
          alt={`${name} de ${card.title}`}
          className="max-h-[65dvh] w-full object-contain"
          fallback={<span className="p-6 text-sm text-muted-foreground">{src ? 'Cargando…' : `No hay foto del ${name.toLowerCase()}`}</span>}
        />
      </button>
      {src && (
        <Button variant="outline" block onClick={() => setFull(true)}>
          <Maximize2 /> Ver a pantalla completa
        </Button>
      )}
      <FullScreen src={full ? src : null} alt={`${name} de ${card.title}`} onClose={() => setFull(false)} />
    </div>
  )
}

// Visor de un documento de identidad: anverso y, si lo hay, reverso.
export function IdCardViewer({ open, card, onClose }: { open: boolean; card: IdCardRef | null; onClose: () => void }) {
  return (
    <Modal
      open={open && !!card}
      onOpenChange={o => !o && onClose()}
      title={card?.title ?? 'Documento'}
      description={card?.subtitle ?? undefined}
      size="lg"
    >
      {/* key: otro documento empieza de nuevo por el anverso. */}
      {card && <Sides key={card.front ?? card.title} card={card} />}
    </Modal>
  )
}
