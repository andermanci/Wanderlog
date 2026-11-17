import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen, Clock, MapPin, Plus, X } from 'lucide-react'
import { Badge, Button, Chip, Input, Notice } from '@/design'
import { addCity, removeCityAt } from '@/lib/cities'
import type { Conflict, DayDrift } from '@/lib/conflicts'
import type { DayCity, DestinationGuide } from '@/types/database'

// Avisos CALCULADOS del día. No se guardan: se recalculan al reordenar el plan.
// Solo se pintan aquí los errores de verdad (dos cosas a la misma hora, o una
// llegada anterior a la salida). «No llegas» y «vas justo» se quedan en el
// trayecto: ya se ve dónde está el problema.
const isCallout = (c: Conflict) => c.kind === 'overlap' || c.kind === 'bad-times'

export function DayConflicts({ conflicts }: { conflicts: Conflict[] }) {
  const shown = conflicts.filter(isCallout)
  if (shown.length === 0) return null
  return (
    <div className="space-y-2" role="status">
      {shown.map(c => (
        <Notice key={`${c.kind}-${c.activityIds.join('-')}`} tone={c.severity === 'error' ? 'danger' : 'warning'} icon={c.kind === 'bad-times' ? Clock : AlertTriangle}>
          {c.message}
        </Notice>
      ))}
    </div>
  )
}

/** Contador para la cabecera del día: se ve el problema sin desplegarlo. */
export function ConflictBadge({ conflicts }: { conflicts: Conflict[] }) {
  const shown = conflicts.filter(isCallout)
  if (shown.length === 0) return null
  return (
    <Badge tone={shown.some(c => c.severity === 'error') ? 'danger' : 'warning'} icon={AlertTriangle}>
      {shown.length} {shown.length === 1 ? 'aviso' : 'avisos'}
    </Badge>
  )
}

function formatDrift(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * Los trayectos que no se han contado al escribir las horas. Encadenar bloques
 * es la forma natural de planear y no es un error, pero el camino existe y el
 * día acaba más tarde. Lo que se quiere saber es si el día cabe.
 */
export function DayDriftNote({ drift }: { drift: DayDrift | undefined }) {
  if (!drift || drift.minutes <= 0) return null
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Contando los trayectos acabarás {drift.projectedEnd
          ? <>sobre las <strong className="font-semibold text-foreground">{drift.projectedEnd}</strong> ({formatDrift(drift.minutes)} más de lo que has puesto)</>
          : <>{formatDrift(drift.minutes)} más tarde</>}.
      </span>
    </p>
  )
}

/**
 * Las ciudades de un día. Cada una es una guía de destino del viaje (y entonces
 * enlaza a ella) o texto suelto: un pueblo de paso no necesita guía.
 */
export function DayCities({ tripId, cities, guides, editMode, onChange }: {
  tripId: string
  cities: DayCity[]
  guides: DestinationGuide[] | undefined
  editMode: boolean
  onChange: (next: DayCity[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const typed = query.trim()
  const chosen = new Set(cities.map(c => c.guide_id).filter(Boolean))
  const options = (guides ?? []).filter(g => !chosen.has(g.id) && g.name.toLowerCase().includes(typed.toLowerCase()))

  function add(city: DayCity) {
    onChange(addCity(cities, city))
    setQuery('')
    setAdding(false)
  }
  function submit() {
    if (!typed) return
    // Intro escoge la guía que coincide (evita duplicar «Roma» a mano teniendo
    // su guía) y si no, guarda lo escrito.
    const match = options.find(g => g.name.toLowerCase() === typed.toLowerCase()) ?? options[0]
    add(match ? { name: match.name, guide_id: match.id } : { name: typed, guide_id: null })
  }

  if (!editMode && cities.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {cities.map((c, i) => (
          <span key={`${c.guide_id ?? 'txt'}-${c.name}-${i}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft pl-3 pr-1 text-sm font-medium text-accent-foreground">
            {c.guide_id
              ? <Link to={`/trips/${tripId}/guide`} title={`Ver la guía de ${c.name}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline"><BookOpen className="size-3.5" aria-hidden="true" />{c.name}</Link>
              : c.name}
            {editMode
              ? (
                <button type="button" aria-label={`Quitar ${c.name}`} onClick={() => onChange(removeCityAt(cities, i))} className="grid size-6 place-items-center rounded-full hover:bg-card/60">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )
              : <span className="w-2" />}
          </span>
        ))}
        {editMode && !adding && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAdding(true)}>
            <Plus /> {cities.length === 0 ? 'Indicar la ciudad' : 'Otra ciudad'}
          </Button>
        )}
      </div>

      {editMode && adding && (
        <div className="space-y-2 rounded-xl bg-sunken p-3">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
            <Input autoFocus value={query} aria-label="Ciudad del día" placeholder="Escribe una ciudad" onChange={e => setQuery(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!typed}>Añadir</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setQuery('') }}>Cancelar</Button>
          </form>
          {options.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Con guía en este viaje:</span>
              {options.map(g => <Chip key={g.id} icon={BookOpen} onClick={() => add({ name: g.name, guide_id: g.id })}>{g.name}</Chip>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
