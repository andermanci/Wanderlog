import { ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DocLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  name: string
}

// Visor a pantalla grande para billetes/entradas y adjuntos: imágenes grandes,
// PDF embebido, con opción de abrir/descargar.
export function DocLightbox({ open, onOpenChange, url, name }: DocLightboxProps) {
  const isPdf = !!url && /\.pdf(\?|$)/i.test(url)
  const isImg = !!url && /\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(url)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="font-serif truncate pr-6">{name}</DialogTitle>
        </DialogHeader>
        {url && (
          <>
            {isPdf ? (
              <iframe title={name} src={url} className="w-full h-[70vh] rounded-lg border border-border" />
            ) : isImg ? (
              <img src={url} alt={name} className="w-full max-h-[72vh] object-contain rounded-lg" style={{ background: 'var(--secondary)' }} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No se puede previsualizar este archivo.</p>
            )}
            <Button variant="outline" className="w-full gap-1.5" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Abrir / descargar
              </a>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
