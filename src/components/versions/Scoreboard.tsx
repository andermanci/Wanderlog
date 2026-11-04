import { Check } from 'lucide-react'
import type { VersionMetrics } from '@/lib/versions/metrics'
import { LATE_END } from '@/lib/versions/metrics'
import { SIDE } from './versionStyle'

// Cuatro números lado a lado. Solo se marca la mejor donde "mejor" no es una
// opinión: menos kilómetros y menos días que acaban tarde. La hora de empezar
// y el número de visitas son cuestión de gustos, así que solo se enseñan.
export function Scoreboard({ a, b, nameA, nameB }: { a: VersionMetrics; b: VersionMetrics; nameA: string; nameB: string }) {
  const tiles: { label: string; hint: string; va: number; vb: number; fmt: (v: number) => string; better?: 'low' }[] = [
    { label: 'Kilómetros entre visitas', hint: 'En línea recta, del hotel y vuelta', va: a.km, vb: b.km, fmt: v => `${Math.round(v)} km`, better: 'low' },
    { label: 'Días que acaban tarde', hint: `Después de las ${LATE_END}`, va: a.lateDays, vb: b.lateDays, fmt: v => String(v), better: 'low' },
    { label: 'Hora media de inicio', hint: 'Primera actividad del día', va: toMin(a.avgStart), vb: toMin(b.avgStart), fmt: fromMin },
    { label: 'Visitas', hint: 'Sin contar trenes ni vuelos', va: a.visits, vb: b.visits, fmt: v => String(v) },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => {
        const max = Math.max(t.va, t.vb, 1)
        const winner = t.better && t.va !== t.vb ? (t.va < t.vb ? 'a' : 'b') : null
        return (
          <div key={t.label} className="rounded-2xl border bg-card p-4 flex flex-col gap-3 min-w-0">
            <div>
              <p className="text-sm font-medium leading-tight">{t.label}</p>
              <p className="text-[11px] text-muted-foreground">{t.hint}</p>
            </div>
            {(['a', 'b'] as const).map(side => {
              const v = side === 'a' ? t.va : t.vb
              const isNum = Number.isFinite(v)
              return (
                <div key={side} className="flex flex-col gap-1" title={side === 'a' ? nameA : nameB}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: SIDE[side].color }}>{side.toUpperCase()}</span>
                    <span className="font-serif text-lg tabular-nums flex items-center gap-1">
                      {winner === side && <Check size={14} style={{ color: 'var(--success)' }} aria-label="Mejor" />}
                      {isNum ? t.fmt(v) : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--secondary)' }}>
                    <div className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: isNum ? `${Math.max(4, (v / max) * 100)}%` : 0, background: SIDE[side].color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN)
const fromMin = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`
