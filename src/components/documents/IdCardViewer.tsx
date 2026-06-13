import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RotateCw, IdCard } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface IdCardViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string | null
  front: string | null
  back: string | null
}

// Visor de documento de identidad: muestra el anverso y, al "girar", hace un
// flip 3D al reverso.
export function IdCardViewer({ open, onOpenChange, title, subtitle, front, back }: IdCardViewerProps) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => { if (open) setFlipped(false) }, [open])
  const hasBack = !!back

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2 pr-6">
            <IdCard size={18} style={{ color: 'var(--primary)' }} />
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>
        {subtitle && <p className="text-sm text-muted-foreground -mt-1">{subtitle}</p>}

        <div style={{ perspective: 1200 }} className="w-full py-2">
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            style={{ transformStyle: 'preserve-3d', position: 'relative' }}
            className="w-full aspect-[8.56/5.4]"
          >
            {/* Anverso */}
            <div className="absolute inset-0 rounded-xl overflow-hidden border border-border"
              style={{ backfaceVisibility: 'hidden', background: 'var(--secondary)' }}>
              {front
                ? <img src={front} alt="Anverso" className="w-full h-full object-contain" />
                : <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sin anverso</div>}
            </div>
            {/* Reverso */}
            <div className="absolute inset-0 rounded-xl overflow-hidden border border-border"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'var(--secondary)' }}>
              {back
                ? <img src={back} alt="Reverso" className="w-full h-full object-contain" />
                : <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sin reverso</div>}
            </div>
          </motion.div>
        </div>

        {hasBack && (
          <Button variant="outline" className="w-full gap-1.5" onClick={() => setFlipped(f => !f)}>
            <RotateCw size={15} /> {flipped ? 'Ver anverso' : 'Ver reverso'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
