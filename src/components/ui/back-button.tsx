import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BackButtonProps {
  to: string
  children: ReactNode
  className?: string
}

// Botón de "volver" con borde y texto (no un icono suelto): más fácil de
// ver y de tocar en móvil que un icono flotante sin contorno.
export function BackButton({ to, children, className }: BackButtonProps) {
  return (
    <Button variant="outline" size="sm" className={`gap-1.5 -ml-1 ${className ?? ''}`} asChild>
      <Link to={to}>
        <ArrowLeft size={14} /> {children}
      </Link>
    </Button>
  )
}
