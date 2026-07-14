import { AlertTriangle, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Conflict } from '@/lib/conflicts'

// Avisos CALCULADOS del día: solapes, "no llegas" y horas imposibles. No se
// guardan en ninguna tabla — se recalculan solos al reordenar el itinerario, así
// que nunca se quedan obsoletos.
//
// Mismo lenguaje visual que las alertas manuales (DayAlerts), pero de solo
// lectura: no son del usuario, son consecuencia de su plan.
//
// "Vas justo" (tight) NO se pinta aquí: se queda en el conector, en ámbar. Si el
// itinerario se llena de callouts amarillos, dejan de leerse todos.

interface DayConflictsProps {
  conflicts: Conflict[]
}

export function DayConflicts({ conflicts }: DayConflictsProps) {
  const shown = conflicts.filter(c => c.kind !== 'tight')
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
  const shown = conflicts.filter(c => c.kind !== 'tight')
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
