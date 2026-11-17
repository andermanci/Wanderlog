import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Segmented, Skeleton, Spinner } from '@/design'
import { uploadDocumentFile } from '@/lib/queries/documents'
import { cropDocument } from '@/lib/idScan'
import { useAuthStore } from '@/store/authStore'
import { DocImage } from './DocImage'

interface IdPhotoInputProps {
  /** «Anverso» o «Reverso». */
  label: string
  /** Path del fichero ya subido al bucket privado `documents`. */
  value: string | null
  tripId: string
  onChange: (path: string | null) => void
  /** Avisa mientras se procesa o se sube, para bloquear «Guardar». */
  onBusyChange?: (busy: boolean) => void
}

interface Pending {
  original: File
  originalUrl: string
  cropped: Blob | null
  croppedUrl: string | null
}

type Version = 'original' | 'recorte'

// Foto de una cara de un documento: se intenta recortar sola, se deja elegir
// entre la foto tal cual y el recorte, y se sube. Si el recorte falla, se sube
// la original: nunca te quedas sin poder guardarla.
export function IdPhotoInput({ label, value, tripId, onChange, onBusyChange }: IdPhotoInputProps) {
  const user = useAuthStore(s => s.user)
  const fileRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  // Por defecto se enseña la foto ORIGINAL (segura); el recorte es opcional.
  const [version, setVersion] = useState<Version>('original')

  async function onPick(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('La imagen pesa más de 10 MB'); return }
    setProcessing(true)
    onBusyChange?.(true)
    const cropped = await cropDocument(file)
    setVersion('original')
    setPending({
      original: file,
      originalUrl: URL.createObjectURL(file),
      cropped,
      croppedUrl: cropped ? URL.createObjectURL(cropped) : null,
    })
    setProcessing(false)
  }

  function closePending() {
    if (pending) {
      URL.revokeObjectURL(pending.originalUrl)
      if (pending.croppedUrl) URL.revokeObjectURL(pending.croppedUrl)
    }
    setPending(null)
    onBusyChange?.(false)
  }

  async function confirm() {
    if (!pending || !user) return
    setUploading(true)
    try {
      const blob = version === 'recorte' && pending.cropped ? pending.cropped : pending.original
      const file = blob instanceof File ? blob : new File([blob], `doc-${Date.now()}.jpg`, { type: 'image/jpeg' })
      onChange(await uploadDocumentFile(file, user.id, tripId))
      closePending()
    } catch {
      toast.error('No se pudo subir la foto')
    } finally {
      setUploading(false)
    }
  }

  const pick = () => fileRef.current?.click()

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={`Foto del ${label.toLowerCase()}`}
        onChange={e => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = '' }}
      />

      {pending ? (
        // Vista previa: se elige versión y se sube, sin salir del formulario.
        <div className="space-y-3 rounded-xl bg-sunken p-3">
          {pending.cropped && (
            <Segmented<Version>
              block
              size="sm"
              label={`Versión de la foto del ${label.toLowerCase()}`}
              value={version}
              onChange={setVersion}
              options={[{ value: 'original', label: 'Foto tal cual' }, { value: 'recorte', label: 'Recortada' }]}
            />
          )}
          <img
            src={version === 'recorte' && pending.croppedUrl ? pending.croppedUrl : pending.originalUrl}
            alt={`Vista previa del ${label.toLowerCase()}`}
            className="max-h-64 w-full rounded-md border border-border bg-card object-contain"
          />
          <p className="text-xs text-muted-foreground">
            {pending.cropped
              ? 'Hemos recortado el documento. Elige la versión que se vea mejor.'
              : 'No hemos podido recortarla sola: se guardará la foto tal cual.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" loading={uploading} onClick={confirm}>Usar esta foto</Button>
            <Button variant="ghost" disabled={uploading} onClick={closePending}>Descartar</Button>
          </div>
        </div>
      ) : value ? (
        <div className="space-y-2">
          <DocImage
            src={value}
            alt={label}
            className="h-36 w-full rounded-xl border border-border bg-sunken object-cover"
            fallback={<Skeleton className="h-36 w-full rounded-xl" />}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pick} disabled={processing}>Cambiar foto</Button>
            <Button variant="danger-ghost" onClick={() => onChange(null)}>Quitar</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={processing}
          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
        >
          {processing ? <Spinner label="Preparando la foto" /> : <Camera className="size-6" aria-hidden="true" />}
          <span className="text-sm font-medium">{processing ? 'Preparando la foto…' : 'Hacer o subir foto'}</span>
        </button>
      )}
    </div>
  )
}
