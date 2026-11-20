import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'

interface PhotoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined
  /** Lo que se pinta si no hay foto o no carga (archivo borrado, sin conexión). Por defecto, nada. */
  fallback?: ReactNode
}

/**
 * Una foto que, si no carga, desaparece limpia en vez de dejar el icono de
 * imagen rota. Ocurre con portadas cuyo archivo ya no existe en el almacenamiento.
 */
export function Photo({ src, fallback = null, onError, ...props }: PhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) return <>{fallback}</>
  return (
    <img
      {...props}
      src={src}
      onError={e => { setFailedSrc(src); onError?.(e) }}
    />
  )
}
