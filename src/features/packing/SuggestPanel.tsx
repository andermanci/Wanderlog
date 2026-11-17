import { useMemo, useState } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { PackageCheck, ThermometerSun } from 'lucide-react'
import { Button, Checkbox, Empty, Notice, Panel, Spinner } from '@/design'
import { suggestPacking, dedupeAgainst, type SuggestedItem } from '@/lib/packing/suggest'
import { useTripClimate } from '@/lib/queries/climate'
import { useDestinationGuides } from '@/lib/queries/guide'
import { useActivities, useItineraryDays } from '@/lib/queries/itinerary'
import { useBulkCreatePackingItems } from '@/lib/queries/packing'
import { useTripWeather } from '@/lib/queries/weather'
import type { PackingItem, Trip } from '@/types/database'

interface SuggestPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trip: Trip
  /** Lo que ya hay en la lista: no se vuelve a proponer. */
  existing: PackingItem[]
}

/**
 * Propone qué llevar según la duración del viaje, el tiempo que va a hacer, el
 * plan del itinerario y el enchufe del destino. Se enseña con el motivo de cada
 * cosa y no añade nada hasta que la persona lo confirma.
 */
export function SuggestPanel({ open, onOpenChange, trip, existing }: SuggestPanelProps) {
  const { data: days } = useItineraryDays(trip.id)
  const { data: activities } = useActivities(trip.id)
  const { data: guides } = useDestinationGuides(trip.id)
  const { data: forecast } = useTripWeather(trip, days, activities)

  const nights = Math.max(0, differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)))

  // La previsión solo llega a 16 días. Para un viaje más lejano (que es cuando
  // de verdad se hace la maleta) se tira del clima típico de esas fechas.
  const hasForecast = Object.keys(forecast ?? {}).length > 0
  const { data: climate, isFetching: loadingClimate } = useTripClimate(trip, open && !hasForecast)

  const weather = useMemo(() => {
    const forecastDays = Object.values(forecast ?? {})
    if (forecastDays.length > 0) {
      return {
        tmin: Math.min(...forecastDays.map(d => d.tmin)),
        tmax: Math.max(...forecastDays.map(d => d.tmax)),
        // La previsión diaria no trae lluvia; solo se sabe por el clima típico.
        rainyRatio: null as number | null,
        source: 'forecast' as const,
      }
    }
    if (climate) {
      return { tmin: climate.tmin, tmax: climate.tmax, rainyRatio: climate.rainyRatio, source: 'climate' as const }
    }
    return null
  }, [forecast, climate])

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

  function add() {
    bulkCreate.mutate(
      chosen.map((s, i) => ({ trip_id: trip.id, category: s.category, name: s.name, is_checked: false, order_index: i })),
      { onSuccess: () => { setSkipped(new Set()); onOpenChange(false) } },
    )
  }

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title="Sugerencia de equipaje"
      description={`Pensada para ${nights + 1} ${nights === 0 ? 'día' : 'días'} de viaje, el tiempo que va a hacer y lo que tienes en el plan.`}
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" loading={bulkCreate.isPending} disabled={chosen.length === 0} onClick={add}>
            {chosen.length > 0 ? `Añadir ${chosen.length} a mi lista` : 'Añadir a mi lista'}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {weather && (
          <Notice tone="info" icon={ThermometerSun}>
            {weather.source === 'forecast'
              ? `La previsión dice que hará entre ${weather.tmin}° y ${weather.tmax}°.`
              : `Aún falta mucho para tener previsión. En esas fechas, allí suele hacer entre ${weather.tmin}° y ${weather.tmax}°.`}
          </Notice>
        )}

        {loadingClimate ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Spinner className="size-7" label="Mirando el tiempo del destino" />
            <p className="text-[0.9375rem]">Mirando el tiempo del destino…</p>
          </div>
        ) : suggestions.length === 0 ? (
          <Empty
            bare
            icon={PackageCheck}
            title="Ya lo tienes todo"
            description="Tu lista ya incluye todo lo que te propondríamos. Si echas algo en falta, añádelo a mano."
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Desmarca lo que no quieras. Debajo de cada cosa verás por qué te la proponemos.
            </p>
            {groupByCategory(suggestions).map(([category, items]) => (
              <section key={category}>
                <h3 className="eyebrow mb-1">{category}</h3>
                <ul className="divide-y divide-border">
                  {items.map(item => {
                    const id = `sugerencia-${item.category}-${item.name}`
                    return (
                      <li key={item.name} className="flex min-h-14 items-center gap-3 py-2.5">
                        <Checkbox id={id} checked={!skipped.has(item.name)} onCheckedChange={() => toggle(item.name)} />
                        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                          <span className="block text-[0.9375rem] font-medium">{item.name}</span>
                          {item.reason && <span className="block text-sm text-muted-foreground">{item.reason}</span>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Panel>
  )
}

function groupByCategory(items: SuggestedItem[]): [string, SuggestedItem[]][] {
  const map = new Map<string, SuggestedItem[]>()
  for (const item of items) map.set(item.category, [...(map.get(item.category) ?? []), item])
  return [...map.entries()]
}
