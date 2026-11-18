import type { Tone } from '@/design'

interface PackingRingProps {
  done: number
  total: number
  tone: Tone
}

const R = 52
const LENGTH = 2 * Math.PI * R

/** Anillo de progreso del equipaje, con «5 de 12» dentro. */
export function PackingRing({ done, total, tone }: PackingRingProps) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0

  return (
    <div
      role="progressbar"
      aria-label="Equipaje preparado"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} de ${total} en la maleta`}
      data-tone={tone}
      className="relative size-36 shrink-0 md:size-44"
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="9" className="stroke-secondary" />
        <circle
          cx="60" cy="60" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
          className="stroke-tone transition-[stroke-dashoffset] duration-500 ease-out"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - ratio)}
        />
      </svg>
      <p className="absolute inset-0 grid place-content-center text-center leading-none">
        <span className="font-serif text-5xl font-medium tracking-tight tabular-nums md:text-6xl">{done}</span>
        <span className="mt-1.5 text-sm text-muted-foreground tabular-nums">de {total}</span>
      </p>
    </div>
  )
}
