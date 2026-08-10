import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// Piezas repetidas de las pantallas del panel. Viven juntas porque son
// pequeñas y siempre se usan a la vez; separarlas en seis ficheros haría el
// panel más difícil de leer, no más fácil.

export function AdminHeader({ titulo, subtitulo, children }: {
  titulo: string
  subtitulo?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h2 className="font-serif text-2xl font-medium">{titulo}</h2>
        {subtitulo && <p className="text-muted-foreground text-sm mt-0.5">{subtitulo}</p>}
      </div>
      {children}
    </div>
  )
}

export function Buscador({ valor, onChange, placeholder }: {
  valor: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative max-w-sm w-full mb-4">
      <Search size={15} aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        type="search"
      />
    </div>
  )
}

export function TablaSkeleton({ filas = 6 }: { filas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: filas }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" style={{ background: 'var(--secondary)' }} />
      ))}
    </div>
  )
}

// Paginación. Se muestra el total siempre que haya más de una página: sin él,
// "Siguiente" es un botón a ciegas.
export function Paginacion({ page, total, porPagina, onChange, unidad }: {
  page: number
  total: number
  porPagina: number
  onChange: (p: number) => void
  unidad: string
}) {
  const paginas = Math.ceil(total / porPagina)
  if (paginas <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 gap-4">
      <span className="text-xs text-muted-foreground">
        {total} {unidad} · página {page + 1} de {paginas}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0}
          onClick={() => onChange(page - 1)}>Anterior</Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= paginas}
          onClick={() => onChange(page + 1)}>Siguiente</Button>
      </div>
    </div>
  )
}

// Dato suelto: número grande + etiqueta. Se usa en el resumen y en las fichas.
export function Dato({ valor, etiqueta, sub }: {
  valor: string | number
  etiqueta: string
  sub?: string
}) {
  return (
    <div className="p-4 rounded-xl surface">
      <p className="font-serif text-2xl">{valor}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{etiqueta}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
    </div>
  )
}
