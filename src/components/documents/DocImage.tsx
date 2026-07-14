import { useDocUrl } from '@/lib/docCache'

interface DocImageProps {
  /** Lo que hay en la BD: el path del bucket privado, o la URL de un adjunto público. */
  src: string | null | undefined
  alt: string
  className?: string
  /** Qué pintar mientras se firma la URL (o si el documento no está disponible). */
  fallback?: React.ReactNode
}

// `<img>` para ficheros del bucket privado `documents`: resuelve el path a una
// URL firmada (o al blob cacheado, sin conexión) antes de pintar.
export function DocImage({ src, alt, className, fallback = null }: DocImageProps) {
  const url = useDocUrl(src)
  if (!url) return <>{fallback}</>
  return <img src={url} alt={alt} className={className} />
}
