import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import { ActivityIcon } from '@/components/icons/ActivityIcon'
import { DocIcon } from '@/components/icons/DocIcon'
import { useActivities } from '@/lib/queries/itinerary'
import { useDocuments } from '@/lib/queries/documents'
import { useFavoritePlaces } from '@/lib/queries/places'
import { useTripSearchStore } from '@/store/tripSearchStore'
import { ACTIVITY_COLORS } from '@/lib/utils'

// Paleta de búsqueda del viaje (Cmd+K o botón lupa del TripHeader): encuentra
// actividades, documentos y lugares guardados sin salir de donde estés.
// Todo client-side sobre datos ya cacheados por React Query; el filtrado
// difuso lo hace cmdk con el `value` compuesto de cada item.
export function TripSearchCommand({ tripId }: { tripId: string }) {
  const navigate = useNavigate()
  const { open, setOpen } = useTripSearchStore()
  const { data: activities } = useActivities(tripId)
  const { data: documents } = useDocuments(tripId)
  const { data: places } = useFavoritePlaces(tripId)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!useTripSearchStore.getState().open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar en el viaje…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {(activities?.length ?? 0) > 0 && (
          <CommandGroup heading="Actividades">
            {activities!.map(a => (
              <CommandItem
                key={a.id}
                value={`${a.title} ${a.address ?? ''} ${a.origin ?? ''} ${a.destination ?? ''}`}
                onSelect={() => go(`/trips/${tripId}/itinerary/${a.id}`)}
              >
                <ActivityIcon type={a.type} style={{ color: ACTIVITY_COLORS[a.type] }} className="mr-2 flex-shrink-0" />
                <span className="truncate">{a.title}</span>
                {a.address && <span className="ml-2 text-xs text-muted-foreground truncate">{a.address}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {(documents?.length ?? 0) > 0 && (
          <CommandGroup heading="Documentos">
            {documents!.map(d => (
              <CommandItem
                key={d.id}
                value={`${d.title} ${d.provider ?? ''} ${d.destination ?? ''}`}
                onSelect={() => go(`/trips/${tripId}/documents`)}
              >
                <DocIcon category={d.category} style={{ color: 'var(--primary)' }} className="mr-2 flex-shrink-0" />
                <span className="truncate">{d.title}</span>
                {d.provider && <span className="ml-2 text-xs text-muted-foreground truncate">{d.provider}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {(places?.length ?? 0) > 0 && (
          <CommandGroup heading="Lugares guardados">
            {places!.map(p => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.collection ?? ''} ${p.notes ?? ''} ${p.address ?? ''}`}
                onSelect={() => go(`/trips/${tripId}/places`)}
              >
                <MapPin style={{ color: 'var(--primary)' }} className="mr-2 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
                {p.collection && <span className="ml-2 text-xs text-muted-foreground truncate">{p.collection}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
