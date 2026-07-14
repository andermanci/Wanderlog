import { AlertTriangle, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Conflict, DayDrift } from '@/lib/conflicts'

// Avisos CALCULADOS del día. No se guardan en ninguna tabla: se recalculan solos
// al reordenar el itinerario, así que nunca se quedan obsoletos.
//
// Mismo lenguaje visual que las alertas manuales (DayAlerts), pero de solo
// lectura: no son del usuario, son consecuencia de su plan.
//
// Solo se pintan aquí los ERRORES de verdad: dos cosas a la misma hora, o una
// llegada anterior a la salida. "No llegas" y "vas justo" se quedan en el
// conector (rojo y ámbar): ya se ve dónde está el problema, y un párrafo por
// cada tramo apretado convierte el día en un muro de texto que nadie lee.
const isCallout = (c: Conflict) => c.kind === 'overlap' || c.kind === 'bad-times'

interface DayConflictsProps {
  conflicts: Conflict[]
}

export function DayConflicts({ conflicts }: DayConflictsProps) {
  const shown = conflicts.filter(isCallout)
  if (shown.length === 0) return null

  return (
    <div className="space-y-1.5 mb-3" role="status">
      <AnimatePresence initial={false}>
        {shown.map(c => {
          const color = c.severity === 'error' ? 'var(--destructive)' : 'var(--warning)'
          const Icon = c.kind === 'bad-times' ? Clock : AlertTriangle
          return (
            <motion.div
              key={`${c.kind}-${c.activityIds.join('-')}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-start gap-2 p-2.5 rounded-lg text-sm"
              style={{
                background: `color-mix(in srgb, ${color} 8%, var(--card))`,
                border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
              }}
            >
              <Icon size={15} style={{ color }} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="min-w-0 break-words">{c.message}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/** Contador para la cabecera del día: se ve el problema sin desplegarlo. */
export function ConflictBadge({ conflicts }: DayConflictsProps) {
  const shown = conflicts.filter(isCallout)
  if (shown.length === 0) return null
  const color = shown.some(c => c.severity === 'error') ? 'var(--destructive)' : 'var(--warning)'

  return (
    <span
      className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      title={shown.map(c => c.message).join('\n')}
    >
      <AlertTriangle size={10} aria-hidden="true" />
      {shown.length}
      <span className="sr-only">
        {shown.length === 1 ? 'aviso en este día' : 'avisos en este día'}
      </span>
    </span>
  )
}

/**
 * Los trayectos que el usuario no ha contado al escribir las horas.
 *
 * Encadenar los bloques (el Coliseo hasta las 10:45 y el Foro desde las 10:45)
 * es la forma natural de planificar, y no es un error — pero los 13 minutos
 * andando existen, y el día acaba más tarde. Esto lo dice sin acusar a nadie, y
 * es lo que de verdad se quiere saber: si el día cabe.
 *
 * No es lo mismo que el "≈ 1 h 20 min en trayectos" de al lado: eso es TODO el
 * camino del día; esto es solo la parte que no está en las horas.
 */
export function DayDriftNote({ drift }: { drift: DayDrift | undefined }) {
  if (!drift || drift.minutes <= 0) return null

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
      <Clock size={11} className="flex-shrink-0" aria-hidden="true" />
      <span>
        Con los trayectos acabarás {drift.projectedEnd ? <>sobre las <strong className="font-medium">{drift.projectedEnd}</strong></> : <>{formatDrift(drift.minutes)} más tarde</>}
        {drift.projectedEnd && <> ({formatDrift(drift.minutes)} más de lo que has puesto)</>}.
      </span>
    </p>
  )
}

function formatDrift(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
