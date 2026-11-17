import { useRef, useState, type ReactNode } from 'react'
import { FileCheck2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Spinner } from '@/design'
import { uploadDocumentFile } from '@/lib/queries/documents'
import { useAuthStore } from '@/store/authStore'

interface FileFieldProps {
  label: ReactNode
  hint?: ReactNode
  /** Path del archivo ya subido al bucket privado `documents`. */
  value: string | null
  tripId: string
  onChange: (path: string | null) => void
  /** Avisa mientras se sube, para bloquear «Guardar». */
  onBusyChange?: (busy: boolean) => void
}

// Subir un archivo suelto (PDF o imagen): el billete, la póliza, el visado…
export function FileField({ label, hint, value, tripId, onChange, onBusyChange }: FileFieldProps) {
  const user = useAuthStore(s => s.user)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    if (!user) return
    setUploading(true)
    onBusyChange?.(true)
    try {
      onChange(await uploadDocumentFile(file, user.id, tripId))
    } catch {
      toast.error('No se pudo subir el archivo')
    } finally {
      setUploading(false)
      onBusyChange?.(false)
    }
  }

  const pick = () => fileRef.current?.click()

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        aria-label={typeof label === 'string' ? label : 'Archivo'}
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }}
      />
      {value && !uploading ? (
        <div data-tone="success" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-tone-line bg-tone-soft px-4 py-2.5">
          <FileCheck2 className="size-5 shrink-0 text-tone" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-medium">Archivo subido</span>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={pick}>Cambiar</Button>
            <Button variant="danger-ghost" size="sm" onClick={() => onChange(null)}>Quitar</Button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-dashed border-border-strong bg-card px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
        >
          {uploading ? <Spinner label="Subiendo" /> : <Upload className="size-5 shrink-0" aria-hidden="true" />}
          {uploading ? 'Subiendo…' : 'Subir archivo (PDF o imagen)'}
        </button>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
