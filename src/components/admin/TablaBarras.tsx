import type { ReactNode } from 'react'
import type { Conteo } from '@/lib/analytics/aggregate'

// Lista con barra de porcentaje. No usa la primitiva <Table>: aquí lo que se
// lee es la proporción, y una barra la enseña mejor que una columna de cifras.
//
// EL PIE ES PARTE DEL DISEÑO, no un adorno. Sin él, «sesiones» se lee como
// «usuarios» y «una sola vista» como «no le interesó», y las dos lecturas son
// falsas. Una tabla de analítica sin advertencias es una tabla que se
// malinterpreta.
export function TablaBarras<T extends Conteo>({ titulo, filas, total, pie, formatear }: {
  titulo: string
  filas: T[]
  /** Sobre qué se calcula el porcentaje. Normalmente el total de sesiones. */
  total: number
  pie?: ReactNode
  /** Texto de la derecha. Por defecto, sesiones y porcentaje. */
  formatear?: (c: T) => string
}) {
  if (!filas.length) return null   // una tabla vacía permanente se lee como avería

  return (
    <section>
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
        {titulo}
      </h3>
      <ul className="space-y-1">
        {filas.map(f => {
          const pct = total > 0 ? Math.round((f.sesiones / total) * 100) : 0
          return (
            <li key={f.clave} className="relative px-3 py-2 rounded-lg overflow-hidden surface">
              {/* La barra va detrás del texto, no al lado: así la fila entera
                  es la unidad y no hay que alinear dos columnas. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-lg"
                style={{
                  width: `${pct}%`,
                  background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                }}
              />
              <span className="relative flex items-center justify-between gap-4 text-sm">
                <span className="truncate">{f.clave}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {formatear ? formatear(f) : `${f.sesiones} · ${pct} %`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {pie && <p className="text-xs text-muted-foreground mt-2">{pie}</p>}
    </section>
  )
}
