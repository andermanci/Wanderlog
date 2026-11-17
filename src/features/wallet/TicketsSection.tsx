import { useState, type ReactNode } from 'react'
import { ChevronRight, Paperclip, QrCode, Ticket } from 'lucide-react'
import { Badge, Button, Card, DocIcon, Empty, Section, Segmented } from '@/design'
import { buildAttachmentPass, buildDocPass, type WalletPass } from '@/lib/wallet/pass'
import { formatDate } from '@/lib/utils'
import { useWalletPassStore } from '@/store/walletPassStore'
import { groupByDate, groupByType, toneOf, whenLabel, GROUP_LABELS, type TicketItem } from './shared'

type Grouping = 'fecha' | 'tipo'

interface TicketRowProps {
  category: string
  title: string
  /** Primera línea: cuándo. */
  when: ReactNode
  /** Segunda línea: con quién y con qué código. */
  meta: ReactNode
  pass: WalletPass | null
  onOpen: () => void
}

// Fila de billete: icono del tipo, título, fecha y datos, y el botón «Mostrar código»
// (a la derecha en escritorio, debajo en el móvil para que no le quite sitio al título).
function TicketRow({ category, title, when, meta, pass, onOpen }: TicketRowProps) {
  const openPass = useWalletPassStore(s => s.openPass)
  return (
    <div className="flex flex-wrap items-center md:flex-nowrap">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-15 min-w-0 flex-1 basis-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/70 md:basis-0"
      >
        <span data-tone={toneOf(category)} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
          <DocIcon category={category} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-foreground">{title}</span>
          {when && <span className="block truncate text-sm text-foreground/80">{when}</span>}
          {meta && <span className="block truncate text-sm text-muted-foreground">{meta}</span>}
        </span>
        <ChevronRight className="size-4.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      </button>
      {pass && (
        <div className="basis-full px-4 pb-3 pl-[4.375rem] md:basis-auto md:p-0 md:pr-3">
          <Button variant="soft" className="md:h-9 md:px-3.5 md:text-sm" onClick={() => openPass(pass)}>
            <QrCode /> Mostrar código
          </Button>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, showType, onOpen }: { item: TicketItem; showType: boolean; onOpen: (item: TicketItem) => void }) {
  if (item.kind === 'attachment') {
    const { att, activity } = item
    return (
      <TicketRow
        category={item.category}
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
  const meta = [
    showType ? GROUP_LABELS[doc.category] : null,
    doc.provider,
    doc.flight_number,
    route,
    doc.seat ? `Asiento ${doc.seat}` : null,
  ].filter(Boolean).join(' · ')
  const code = doc.locator || doc.confirmation_number
  return (
    <TicketRow
      category={item.category}
      title={doc.title}
      when={whenLabel(doc.datetime_start, doc.datetime_end)}
      meta={(meta || code) ? (
        <>
          {meta}
          {meta && code ? ' · ' : ''}
          {code && <span className="font-mono font-medium text-foreground/80">{code}</span>}
        </>
      ) : null}
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
              <Card pad="none" className="divide-y divide-border overflow-hidden">
                {group.items.map(item => (
                  <ItemRow key={item.key} item={item} showType={grouping === 'fecha'} onOpen={onOpen} />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
