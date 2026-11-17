import { ExternalLink } from 'lucide-react'
import { Button, Modal, Skeleton } from '@/design'
import { useDocUrl } from '@/lib/docCache'
import { isImageRef, isPdfRef, type FileRef } from './shared'

/** El archivo en grande: imagen o PDF incrustado. Sin la ventana alrededor. */
export function FileView({ file, className }: { file: FileRef; className?: string }) {
  // El tipo se deduce del valor guardado (conserva la extensión), no de la URL
  // resuelta: un blob: de la copia sin conexión no tiene extensión.
  const src = useDocUrl(file.url)
  if (!src) return <Skeleton className={className ?? 'h-[50dvh] w-full'} />
  if (isPdfRef(file.url, file.mime)) {
    return <iframe title={file.name} src={src} className={className ?? 'h-[70dvh] w-full rounded-xl border border-border'} />
  }
  if (isImageRef(file.url, file.mime)) {
    return <img src={src} alt={file.name} className={className ?? 'max-h-[72dvh] w-full rounded-xl bg-sunken object-contain'} />
  }
  return <p className="py-8 text-center text-sm text-muted-foreground">Este archivo no se puede ver aquí. Ábrelo aparte.</p>
}

/** Enlace para abrir el archivo en otra pestaña (y desde ahí guardarlo). */
export function OpenFileLink({ file }: { file: FileRef }) {
  const src = useDocUrl(file.url)
  if (!src) return null
  return (
    <Button asChild variant="outline">
      <a href={src} target="_blank" rel="noreferrer"><ExternalLink /> Abrir o descargar</a>
    </Button>
  )
}

interface FileViewerProps {
  open: boolean
  file: FileRef | null
  onClose: () => void
}

// Visor a pantalla grande para billetes, pólizas y adjuntos.
export function FileViewer({ open, file, onClose }: FileViewerProps) {
  return (
    <Modal
      open={open && !!file}
      onOpenChange={o => !o && onClose()}
      title={file?.name ?? 'Archivo'}
      size="lg"
      footer={file ? <OpenFileLink file={file} /> : undefined}
    >
      {file && <FileView file={file} />}
    </Modal>
  )
}
