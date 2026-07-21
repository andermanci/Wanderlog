import { useState } from 'react'
import { MapPin, Plus, X, BookOpen } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addCity, removeCityAt } from '@/lib/cities'
import type { DayCity, DestinationGuide } from '@/types/database'

// Las ciudades de un día, en chips. Cada chip es o una guía de destino del viaje
// (y entonces enlaza a su contenido) o texto suelto — un pueblo de paso no
// necesita guía para poder escribirlo.
export function DayCitiesEditor({ cities, guides, onChange }: {
  cities: DayCity[]
  guides: DestinationGuide[] | undefined
  onChange: (next: DayCity[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const chosen = new Set(cities.map(c => c.guide_id).filter(Boolean))
  const options = (guides ?? []).filter(g =>
    !chosen.has(g.id) && g.name.toLowerCase().includes(query.trim().toLowerCase()))
  const typed = query.trim()

  function add(city: DayCity) {
    onChange(addCity(cities, city))
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2" onClick={(e) => e.stopPropagation()}>
      <MapPin size={13} className="text-muted-foreground flex-shrink-0" />

      {cities.map((c, i) => (
        <span
          key={`${c.guide_id ?? 'txt'}-${c.name}-${i}`}
          className="flex items-center gap-1 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full"
          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
        >
          {c.guide_id && <BookOpen size={10} className="flex-shrink-0 opacity-70" />}
          <span className="truncate max-w-[120px]">{c.name}</span>
          <button
            type="button"
            onClick={() => onChange(removeCityAt(cities, i))}
            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10"
            aria-label={`Quitar ${c.name}`} title={`Quitar ${c.name}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery('') }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 h-6 px-2 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary"
            aria-label="Añadir ciudad al día" title="Añadir ciudad al día"
          >
            <Plus size={11} />
            {cities.length === 0 && <span>Ciudad</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !typed) return
              e.preventDefault()
              // Enter escoge la guía que coincide (evita duplicar "Roma" a mano
              // teniendo su guía) y si no, guarda lo escrito.
              const match = options.find(g => g.name.toLowerCase() === typed.toLowerCase()) ?? options[0]
              add(match ? { name: match.name, guide_id: match.id } : { name: typed, guide_id: null })
            }}
            placeholder="Escribe una ciudad"
            className="w-full h-8 text-sm px-2 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="max-h-48 overflow-y-auto mt-1">
            {options.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => add({ name: g.name, guide_id: g.id })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary"
              >
                <BookOpen size={13} className="flex-shrink-0" style={{ color: 'var(--primary)' }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            {typed && !options.some(g => g.name.toLowerCase() === typed.toLowerCase()) && (
              <button
                type="button"
                onClick={() => add({ name: typed, guide_id: null })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary"
              >
                <Plus size={13} className="flex-shrink-0 text-muted-foreground" />
                <span className="truncate">Añadir «{typed}»</span>
              </button>
            )}
            {!typed && options.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {chosen.size > 0 && (guides?.length ?? 0) > 0
                  ? 'Ya están todas las guías del viaje. Escribe otra ciudad.'
                  : 'Escribe la ciudad. Las guías de destino que crees aparecerán aquí.'}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
