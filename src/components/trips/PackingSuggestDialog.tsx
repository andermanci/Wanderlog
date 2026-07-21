import { useMemo, useState } from 'react'
import { Loader2, Sparkles, Info } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBulkCreatePackingItems } from '@/lib/queries/packing'
import { suggestPacking, dedupeAgainst, type SuggestedItem } from '@/lib/packing/suggest'
import { useTripWeather } from '@/lib/queries/weather'
import { useTripClimate } from '@/lib/queries/climate'
import { useItineraryDays, useActivities } from '@/lib/queries/itinerary'
import { useDestinationGuides } from '@/lib/queries/guide'
import { differenceInDays, parseISO } from 'date-fns'
import type { Trip, PackingItem } from '@/types/database'

interface PackingSuggestDialogProps {
  open: boolean
  onClose: () => void
  trip: Trip
  existing: PackingItem[]
}

// Genera la lista a partir del viaje: duración, tiempo que va a hacer, plan del
// itinerario y enchufe del destino. Se previsualiza con el motivo de cada cosa
// antes de añadir nada, y no propone lo que ya está en la lista.
export function PackingSuggestDialog({ open, onClose, trip, existing }: PackingSuggestDialogProps) {
  const { data: days } = useItineraryDays(trip.id)
  const { data: activities } = useActivities(trip.id)
  const { data: guides } = useDestinationGuides(trip.id)
  const { data: forecast } = useTripWeather(trip, days, activities)

  const nights = Math.max(0, differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)))

  // La previsión solo llega a 16 días. Para un viaje más lejano (que es cuando
  // de verdad haces la maleta) se tira del clima típico de esas fechas.
  const forecastDays = Object.values(forecast ?? {})
  const hasForecast = forecastDays.length > 0
  const { data: climate, isFetching: loadingClimate } = useTripClimate(trip, open && !hasForecast)

  const weather = useMemo(() => {
    if (hasForecast) {
      return {
        tmin: Math.min(...forecastDays.map(d => d.tmin)),
        tmax: Math.max(...forecastDays.map(d => d.tmax)),
        // La previsión diaria no trae precipitación; la lluvia solo la sabemos
        // por el clima típico.
        rainyRatio: null as number | null,
        source: 'forecast' as const,
      }
    }
    if (climate) {
      return { tmin: climate.tmin, tmax: climate.tmax, rainyRatio: climate.rainyRatio, source: 'climate' as const }
    }
    return null
  }, [hasForecast, forecastDays, climate])

  const suggestions = useMemo(() => dedupeAgainst(
    suggestPacking({
      nights,
      tmin: weather?.tmin,
      tmax: weather?.tmax,
      rainyRatio: weather?.rainyRatio,
      activities: (activities ?? []).map(a => ({ title: a.title, type: a.type })),
      plug: guides?.[0]?.facts?.plug ?? null,
    }),
    existing,
  ), [nights, weather, activities, guides, existing])

  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const bulkCreate = useBulkCreatePackingItems()

  const chosen = suggestions.filter(s => !skipped.has(s.name))

  function toggle(name: string) {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function handleAdd() {
    bulkCreate.mutate(
      chosen.map((s, i) => ({
        trip_id: trip.id,
        category: s.category,
        name: s.name,
        is_checked: false,
        order_index: i,
      })),
      { onSuccess: () => { setSkipped(new Set()); onClose() } },
    )
  }

  const byCategory = groupByCategory(suggestions)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} /> Generar mi lista
          </DialogTitle>
          <DialogDescription>
            Según los {nights + 1} días de viaje, el tiempo que va a hacer y lo que
            tienes en el itinerario.
          </DialogDescription>
        </DialogHeader>

        {weather && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground p-2.5 rounded-lg"
            style={{ background: 'var(--secondary)' }}>
            <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
            <span>
              {weather.source === 'forecast'
                ? `Previsión: de ${weather.tmin}° a ${weather.tmax}°.`
                : `Aún no hay previsión (queda mucho). En estas fechas, en el destino
                   suele hacer de ${weather.tmin}° a ${weather.tmax}°.`}
            </span>
          </p>
        )}

        {loadingClimate ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Mirando el tiempo del destino…</span>
          </div>
        ) : suggestions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tu lista ya tiene todo lo que se me ocurre.
          </p>
        ) : (
          <ScrollArea className="max-h-[45vh] pr-2 -mr-2">
            {byCategory.map(([category, items]) => (
              <div key={category} className="mb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1 px-1">{category}</p>
                {items.map(item => (
                  <label key={item.name} className="flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-secondary">
                    <Checkbox
                      className="mt-0.5"
                      checked={!skipped.has(item.name)}
                      onCheckedChange={() => toggle(item.name)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm">{item.name}</p>
                      {item.reason && (
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleAdd}
            disabled={chosen.length === 0 || bulkCreate.isPending}
            variant="brand"
            className="gap-2"
          >
            {bulkCreate.isPending && <Loader2 size={14} className="animate-spin" />}
            Añadir {chosen.length > 0 ? `(${chosen.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function groupByCategory(items: SuggestedItem[]): Array<[string, SuggestedItem[]]> {
  const map = new Map<string, SuggestedItem[]>()
  for (const item of items) {
    map.set(item.category, [...(map.get(item.category) ?? []), item])
  }
  return [...map.entries()]
}
