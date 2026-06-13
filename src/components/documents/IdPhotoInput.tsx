import { useRef, useState } from 'react'
import { Camera, Loader2, Check, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { uploadDocumentFile } from '@/lib/queries/documents'
import { cropDocument } from '@/lib/idScan'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

interface IdPhotoInputProps {
  label: string
  value: string | null
  tripId: string
  onChange: (url: string | null) => void
}

// Captura de la foto de un documento (anverso/reverso): la pasa por el recorte
// automático, deja elegir recorte/original y la sube. Fallback sin recorte.
export function IdPhotoInput({ label, value, tripId, onChange }: IdPhotoInputProps) {
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Previsualización: original + recorte detectado (si lo hay)
  const [pending, setPending] = useState<{ original: File; originalUrl: string; cropped: Blob | null; croppedUrl: string | null } | null>(null)
  // Por defecto mostramos la foto ORIGINAL (segura); el recorte es opcional.
  const [showCrop, setShowCrop] = useState(false)

  async function onPick(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('La imagen supera 10 MB'); return }
    setProcessing(true)
    const cropped = await cropDocument(file)
    setShowCrop(false)
    setPending({
      original: file,
      originalUrl: URL.createObjectURL(file),
      cropped,
      croppedUrl: cropped ? URL.createObjectURL(cropped) : null,
    })
    setProcessing(false)
  }

  async function confirm(useCrop: boolean) {
    if (!pending || !user) return
    setUploading(true)
    try {
      const blob = useCrop && pending.cropped ? pending.cropped : pending.original
      const file = blob instanceof File ? blob : new File([blob], `doc-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const url = await uploadDocumentFile(file, user.id, tripId)
      onChange(url)
      closePending()
    } catch {
      toast.error('No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  function closePending() {
    if (pending) {
      URL.revokeObjectURL(pending.originalUrl)
      if (pending.croppedUrl) URL.revokeObjectURL(pending.croppedUrl)
    }
    setPending(null)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />

      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-border">
          <img src={value} alt={label} className="w-full h-32 object-cover" />
          <div className="absolute top-1.5 right-1.5 flex gap-1.5">
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
              Cambiar
            </Button>
            <Button type="button" size="icon" variant="secondary" className="w-7 h-7" onClick={() => onChange(null)} title="Quitar">
              <X size={13} />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="w-full h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          {processing ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          <span className="text-xs">{processing ? 'Procesando…' : 'Hacer / subir foto'}</span>
        </button>
      )}

      {/* Previsualización del recorte */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && !uploading && closePending()}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <ImageIcon size={18} style={{ color: 'var(--primary)' }} /> {label}
            </DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              {/* Selector original / recorte (original por defecto) */}
              {pending.cropped && (
                <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--secondary)' }}>
                  <button type="button" onClick={() => setShowCrop(false)}
                    className="flex-1 text-xs py-1.5 rounded-md font-medium transition-colors"
                    style={!showCrop ? { background: 'var(--card)', color: 'var(--foreground)' } : { color: 'var(--muted-foreground)' }}>
                    Original
                  </button>
                  <button type="button" onClick={() => setShowCrop(true)}
                    className="flex-1 text-xs py-1.5 rounded-md font-medium transition-colors"
                    style={showCrop ? { background: 'var(--card)', color: 'var(--foreground)' } : { color: 'var(--muted-foreground)' }}>
                    Recorte automático
                  </button>
                </div>
              )}
              <img
                src={showCrop && pending.croppedUrl ? pending.croppedUrl : pending.originalUrl}
                alt="Previsualización"
                className="w-full max-h-[50vh] object-contain rounded-lg border border-border"
                style={{ background: 'var(--secondary)' }}
              />
              <p className="text-xs text-muted-foreground text-center">
                {pending.cropped
                  ? 'Elige la versión que prefieras y súbela.'
                  : 'Se subirá la foto tal cual.'}
              </p>
              <Button type="button" className="w-full gap-1.5" disabled={uploading} onClick={() => confirm(showCrop)}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Usar esta foto
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
