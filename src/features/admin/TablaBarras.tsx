import type { ReactNode } from 'react'
import { Section } from '@/design'
import type { Conteo } from '@/lib/analytics/aggregate'

// Lista con barra de porcentaje. No es una tabla: aquí lo que se lee es la
// proporción, y una barra la enseña mejor que una columna de cifras.
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
    <Section title={titulo}>
      <ul className="space-y-1">
        {filas.map(f => {
          const pct = total > 0 ? Math.round((f.sesiones / total) * 100) : 0
          return (
            <li key={f.clave} className="relative overflow-hidden rounded-md border border-border bg-card px-3.5 py-2.5">
              {/* La barra va detrás del texto, no al lado: así la fila entera
                  es la unidad y no hay que alinear dos columnas. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-primary-soft"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
              <span className="relative flex items-center justify-between gap-4 text-sm">
                <span className="truncate">{f.clave}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatear ? formatear(f) : `${f.sesiones} · ${pct} %`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {pie && <p className="text-xs text-muted-foreground">{pie}</p>}
    </Section>
  )
}
