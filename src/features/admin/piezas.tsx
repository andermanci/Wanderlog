import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Button, Card, Input, Skeleton } from '@/design'
import { cn } from '@/lib/utils'

// Piezas repetidas de las pantallas del panel. Viven juntas porque son
// pequeñas y siempre se usan a la vez; separarlas en seis ficheros haría el
// panel más difícil de leer, no más fácil.

export function Buscador({ valor, onChange, placeholder }: {
  valor: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative mb-4 w-full max-w-sm">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-10"
      />
    </div>
  )
}

export function TablaSkeleton({ filas = 6 }: { filas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: filas }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  )
}

// Paginación. Se muestra el total siempre que haya más de una página: sin él,
// «Siguiente» es un botón a ciegas.
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
    <div className="mt-4 flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">
        {total} {unidad} · página {page + 1} de {paginas}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= paginas} onClick={() => onChange(page + 1)}>Siguiente</Button>
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
    <Card pad="sm">
      <p className="font-serif text-2xl tabular-nums">{valor}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{etiqueta}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

/** Rejilla de <Dato>: dos por fila en móvil, cuatro (o tres) en escritorio. */
export function Datos({ columnas = 4, className, children }: { columnas?: 3 | 4; className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', columnas === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3', className)}>
      {children}
    </div>
  )
}

/* ---------- Tabla sencilla (solo escritorio; en móvil las páginas usan fichas) ---------- */

export function Tabla({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card pad="none" className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </Card>
  )
}

export function Th({ num, children }: { num?: boolean; children: ReactNode }) {
  return <th scope="col" className={cn('eyebrow px-4 py-3', num ? 'text-right' : 'text-left')}>{children}</th>
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-border transition-colors hover:bg-secondary/60">{children}</tr>
}

export function Td({ num, className, children }: { num?: boolean; className?: string; children: ReactNode }) {
  return <td className={cn('px-4 py-3 align-middle', num && 'text-right tabular-nums', className)}>{children}</td>
}
