import { useState, type ReactNode } from 'react'
import { ChevronRight, Paperclip, QrCode, Ticket } from 'lucide-react'
import { Badge, Button, DocIcon, Empty, Section, Segmented } from '@/design'
import { buildAttachmentPass, buildDocPass, type WalletPass } from '@/lib/wallet/pass'
import { formatDate } from '@/lib/utils'
import { useWalletPassStore } from '@/store/walletPassStore'
import { groupByDate, groupByType, toneOf, whenLabel, GROUP_LABELS, type TicketItem } from './shared'

type Grouping = 'fecha' | 'tipo'

interface TicketRowProps {
  category: string
  /** Rótulo pequeño sobre el título: qué es (Vuelo, Entrada, Adjunto…). */
  kind: string
  title: string
  /** Cuándo. */
  when: ReactNode
  /** Con quién, trayecto, asiento. */
  meta: ReactNode
  /** Localizador o número de confirmación: va en el talón, bien visible. */
  code?: string | null
  pass: WalletPass | null
  onOpen: () => void
}

// Un billete con forma de billete: a la izquierda qué es y cuándo; a la derecha,
// separado por la línea de corte, el talón con el localizador y «Mostrar código».
function TicketRow({ category, kind, title, when, meta, code, pass, onOpen }: TicketRowProps) {
  const openPass = useWalletPassStore(s => s.openPass)
  return (
    <article data-tone={toneOf(category)} className="relative flex overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <span aria-hidden="true" className="w-1.5 shrink-0 bg-tone" />
      <button
        type="button" onClick={onOpen}
        className="min-w-0 flex-1 cursor-pointer px-4 py-3.5 text-left transition-colors duration-150 hover:bg-secondary/60"
      >
        <span className="eyebrow flex items-center gap-1.5 text-tone">
          <DocIcon category={category} className="size-3.5" /> {kind}
        </span>
        <span className="mt-1 block font-serif text-lg font-medium leading-snug tracking-tight line-clamp-2">{title}</span>
        {when && <span className="mt-1 block text-sm font-medium first-letter:uppercase">{when}</span>}
        {meta && <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">{meta}</span>}
      </button>
      {/* Talón, con las dos muescas de la línea de corte */}
      <div className="relative flex w-28 shrink-0 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-border-strong px-2 py-3 before:absolute before:-left-2.5 before:-top-2.5 before:size-5 before:rounded-full before:bg-background after:absolute after:-bottom-2.5 after:-left-2.5 after:size-5 after:rounded-full after:bg-background md:w-36">
        {code && <span className="max-w-full truncate font-mono text-sm font-semibold tracking-wider">{code}</span>}
        {pass ? (
          <button
            type="button" onClick={() => openPass(pass)}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-primary-soft"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-primary-soft"><QrCode className="size-6" aria-hidden="true" /></span>
            Mostrar código
          </button>
        ) : (
          <button type="button" onClick={onOpen} className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            Ver <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}

function ItemRow({ item, onOpen }: { item: TicketItem; onOpen: (item: TicketItem) => void }) {
  if (item.kind === 'attachment') {
    const { att, activity } = item
    return (
      <TicketRow
        category={item.category}
        kind="Adjunto"
        title={att.name}
        when={item.day ? `${formatDate(item.day, 'EEE d MMM')}${activity?.start_time ? ` · ${activity.start_time.slice(0, 5)}` : ''}` : null}
        meta={<><Paperclip className="mr-1 inline size-3.5 align-[-0.125em]" aria-hidden="true" />Adjunto de «{activity?.title ?? 'una actividad'}»</>}
        pass={buildAttachmentPass(att, activity)}
        onOpen={() => onOpen(item)}
      />
    )
  }
  const { doc } = item
  const route = doc.origin || doc.destination
    ? `${doc.origin ?? ''}${doc.origin && doc.destination ? ' → ' : ''}${doc.destination ?? ''}`
    : null
  const meta = [doc.provider, doc.flight_number, route, doc.seat ? `Asiento ${doc.seat}` : null].filter(Boolean).join(' · ')
  return (
    <TicketRow
      category={item.category}
      kind={GROUP_LABELS[doc.category] ?? 'Reserva'}
      title={doc.title}
      when={whenLabel(doc.datetime_start, doc.datetime_end)}
      meta={meta || null}
      code={doc.locator || doc.confirmation_number}
      pass={buildDocPass(doc)}
      onOpen={() => onOpen(item)}
    />
  )
}

interface TicketsSectionProps {
  items: TicketItem[]
  /** «Ahora», fijado al abrir la pantalla, para decidir qué es hoy y qué ya pasó. */
  now: Date
  canEdit: boolean
  onOpen: (item: TicketItem) => void
  onAdd: () => void
  onImport: () => void
}

// «¿Dónde está el billete?»: lo primero de la pantalla.
export function TicketsSection({ items, now, canEdit, onOpen, onAdd, onImport }: TicketsSectionProps) {
  const [grouping, setGrouping] = useState<Grouping>('fecha')
  const groups = grouping === 'fecha' ? groupByDate(items, now) : groupByType(items)

  return (
    <Section
      title="Billetes y reservas"
      description="Vuelos, trenes, hoteles y entradas, con su código a mano."
      action={items.length > 1 ? (
        <Segmented<Grouping>
          size="sm"
          label="Cómo agrupar los billetes"
          value={grouping}
          onChange={setGrouping}
          options={[{ value: 'fecha', label: 'Por fecha' }, { value: 'tipo', label: 'Por tipo' }]}
        />
      ) : undefined}
    >
      {items.length === 0 ? (
        <Empty
          icon={Ticket}
          title="Aún no hay billetes"
          description={canEdit
            ? 'Guarda aquí tus vuelos, hoteles y entradas. El día que toque, enseñas el código desde el móvil, también sin conexión.'
            : 'Aquí aparecerán los vuelos, hoteles y entradas del viaje cuando alguien los añada.'}
        >
          {canEdit && (
            <>
              <Button variant="soft" onClick={onAdd}>Añadir un billete</Button>
              <Button variant="ghost" onClick={onImport}>Importar .ics</Button>
            </>
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key} className="space-y-2">
              <h3 className="flex items-center gap-2 px-1">
                {group.category && (
                  <span data-tone={toneOf(group.category)} className="text-tone">
                    <DocIcon category={group.category} className="size-4" />
                  </span>
                )}
                <span className="eyebrow">{group.label}</span>
                <Badge>{group.items.length}</Badge>
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {group.items.map(item => <ItemRow key={item.key} item={item} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
