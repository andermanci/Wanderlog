import { useState } from 'react'
import { Modal, Segmented } from '@/design'
import { DocImage } from './DocImage'
import type { IdCardRef } from './shared'

type Side = 'front' | 'back'

function Sides({ card }: { card: IdCardRef }) {
  const [side, setSide] = useState<Side>('front')
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
      <div className="grid aspect-[8.56/5.4] w-full place-items-center overflow-hidden rounded-xl border border-border bg-sunken">
        <DocImage
          key={side}
          src={src}
          alt={`${name} de ${card.title}`}
          className="size-full object-contain"
          fallback={<span className="text-sm text-muted-foreground">{src ? 'Cargando…' : `No hay foto del ${name.toLowerCase()}`}</span>}
        />
      </div>
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
    >
      {card && <Sides card={card} />}
    </Modal>
  )
}
