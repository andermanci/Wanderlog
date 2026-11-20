import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { MapPin, Plane, Search } from 'lucide-react'
import { ActivityIcon, DocIcon } from '@/design'
import { useTrips } from '@/lib/queries/trips'
import { useActivities } from '@/lib/queries/itinerary'
import { useDocuments } from '@/lib/queries/documents'
import { useFavoritePlaces } from '@/lib/queries/places'
import { useTripSearchStore } from '@/store/tripSearchStore'
import { formatDate } from '@/lib/utils'
import { GLOBAL_NAV, tripExtras, tripTabs } from './nav'

const group =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-2xs ' +
  '[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground'

// Sin tildes ni mayúsculas: «coliseo» encuentra «Coliseo» y «cafe», «Caffè».
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Coincidencia literal de cada palabra escrita, no «letras sueltas en orden»:
 * con la búsqueda difusa de cmdk, «colis» también sacaba un hotel y otro viaje.
 * Solo mira el texto (`keywords`); `value` lleva el id y existe para ser único.
 */
function filter(_value: string, search: string, keywords?: string[]): number {
  const text = plain((keywords ?? []).join(' '))
  const words = plain(search).split(/\s+/).filter(Boolean)
  return words.every(w => text.includes(w)) ? 1 : 0
}

function Item({ value, text, onSelect, icon, title, detail, tone }: {
  /** Identificador único de la fila. */
  value: string
  /** Lo que se busca: título y datos de apoyo. */
  text: string
  onSelect: () => void; icon: ReactNode; title: string; detail?: string | null; tone?: string
}) {
  return (
    <Command.Item
      value={value}
      keywords={[text]}
      onSelect={onSelect}
      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[0.9375rem] data-[selected=true]:bg-secondary"
    >
      <span data-tone={tone ?? 'primary'} className="grid size-8 shrink-0 place-items-center rounded-full bg-tone-soft text-tone [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {detail && <span className="max-w-[40%] shrink-0 truncate text-sm text-muted-foreground">{detail}</span>}
    </Command.Item>
  )
}

/**
 * Buscador de toda la app (⌘K o la lupa). Dentro de un viaje encuentra sus
 * actividades, documentos y lugares; siempre, las secciones y los demás viajes.
 * Todo sobre datos que React Query ya tiene: funciona sin conexión.
 */
export function GlobalSearch({ tripId }: { tripId?: string }) {
  const navigate = useNavigate()
  const { open, setOpen } = useTripSearchStore()
  const { data: trips } = useTrips()
  const { data: activities } = useActivities(tripId ?? '')
  const { data: documents } = useDocuments(tripId ?? '')
  const { data: places } = useFavoritePlaces(tripId ?? '')

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

  const go = (path: string) => { setOpen(false); navigate(path) }
  const sections = tripId ? [...tripTabs(tripId), ...tripExtras(tripId)] : []

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.02_50/0.45)] backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Content className="fixed left-1/2 top-[max(1rem,10dvh)] z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border border-border bg-popover text-popover-foreground shadow-float outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out">
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <Dialog.Description className="sr-only">Busca actividades, documentos, lugares, secciones y viajes.</Dialog.Description>
          <Command className={group} filter={filter}>
            <div className="flex items-center gap-3 border-b border-border px-5">
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Command.Input
                placeholder={tripId ? 'Busca en este viaje o ve a otro sitio…' : 'Busca un viaje o una sección…'}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <Command.List className="max-h-[min(60dvh,28rem)] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center text-[0.9375rem] text-muted-foreground">
                No hemos encontrado nada con ese texto.
              </Command.Empty>

              {tripId && (activities?.length ?? 0) > 0 && (
                <Command.Group heading="Actividades">
                  {activities!.map(a => (
                    <Item
                      key={a.id} tone={a.type}
                      value={`act ${a.id}`} text={`${a.title} ${a.address ?? ''} ${a.origin ?? ''} ${a.destination ?? ''}`}
                      onSelect={() => go(`/trips/${tripId}/itinerary/${a.id}`)}
                      icon={<ActivityIcon type={a.type} />} title={a.title} detail={a.address}
                    />
                  ))}
                </Command.Group>
              )}
              {tripId && (documents?.length ?? 0) > 0 && (
                <Command.Group heading="Billetes y documentos">
                  {documents!.map(d => (
                    <Item
                      key={d.id} tone="flight"
                      value={`doc ${d.id}`} text={`${d.title} ${d.provider ?? ''} ${d.destination ?? ''}`}
                      onSelect={() => go(`/trips/${tripId}/documents?doc=${d.id}`)}
                      icon={<DocIcon category={d.category} />} title={d.title} detail={d.provider}
                    />
                  ))}
                </Command.Group>
              )}
              {tripId && (places?.length ?? 0) > 0 && (
                <Command.Group heading="Lugares guardados">
                  {places!.map(p => (
                    <Item
                      key={p.id} tone="place"
                      value={`lugar ${p.id}`} text={`${p.name} ${p.collection ?? ''} ${p.notes ?? ''} ${p.address ?? ''}`}
                      onSelect={() => go(`/trips/${tripId}/itinerary?tab=ideas&place=${p.id}`)}
                      icon={<MapPin aria-hidden="true" />} title={p.name} detail={p.collection}
                    />
                  ))}
                </Command.Group>
              )}
              {sections.length > 0 && (
                <Command.Group heading="Ir a">
                  {sections.map(s => (
                    <Item
                      key={s.key} tone="neutral" value={`ir ${s.key}`} text={s.label} onSelect={() => go(s.to)}
                      icon={<s.icon aria-hidden="true" />} title={s.label}
                    />
                  ))}
                </Command.Group>
              )}
              {(trips?.length ?? 0) > 0 && (
                <Command.Group heading={tripId ? 'Otros viajes' : 'Viajes'}>
                  {trips!.filter(t => t.id !== tripId).map(t => (
                    <Item
                      key={t.id} value={`viaje ${t.id}`} text={`${t.name} ${t.destination ?? ''} ${t.tags.join(' ')}`}
                      onSelect={() => go(`/trips/${t.id}`)}
                      icon={<Plane aria-hidden="true" />} title={t.name}
                      detail={`${t.destination ?? ''} · ${formatDate(t.start_date, 'MMM yyyy')}`}
                    />
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="General">
                {GLOBAL_NAV.map(s => (
                  <Item
                    key={s.key} tone="neutral" value={`general ${s.key}`} text={s.label} onSelect={() => go(s.to)}
                    icon={<s.icon aria-hidden="true" />} title={s.label}
                  />
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
