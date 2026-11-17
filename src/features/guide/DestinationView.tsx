import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowUpDown, BookOpen, Bus, CalendarClock, CalendarDays, ChevronDown, Coins, DownloadCloud,
  ExternalLink, FileText, Hash, Headphones, Landmark, Languages, Pencil, Phone, Plug, Plus,
  RefreshCw, ShieldCheck, Trash2, Users, Utensils, Wifi, Zap, type LucideIcon,
} from 'lucide-react'
import {
  ACTIVITY_ICONS, Badge, Button, Card, Empty, Menu, Row, RowList, Section, type Tone,
} from '@/design'
import { cn } from '@/lib/utils'
import { citiesLabel, hasGuide } from '@/lib/cities'
import { scopeRoute, type AudioguideScope } from '@/lib/audioguide/scope'
import type { TripAudioguideReadiness } from '@/lib/queries/audioguides'
import type { Activity, DestinationGuide, GuideSection, ItineraryDay } from '@/types/database'
import { Markdown } from './Markdown'

function sectionIcon(id: string): LucideIcon {
  if (id.startsWith('costumbres')) return Users
  if (id.startsWith('idioma')) return Languages
  if (id.startsWith('comida')) return Utensils
  if (id.startsWith('dinero')) return Coins
  if (id.startsWith('cuando_ir')) return CalendarClock
  if (id.startsWith('seguridad')) return ShieldCheck
  if (id.startsWith('conectividad')) return Wifi
  if (id.startsWith('moverse')) return Bus
  if (id.startsWith('resumen')) return BookOpen
  return FileText
}

const FACT_ICONS = { currency: Coins, languages: Languages, emergency: Phone, plug: Plug, voltage: Zap, callingCode: Hash } as const
const FACT_LABELS = { currency: 'Moneda', languages: 'Idioma', emergency: 'Emergencias', plug: 'Enchufe', voltage: 'Voltaje', callingCode: 'Prefijo' } as const

interface AudioguideItem {
  key: string
  scope: AudioguideScope
  title: string
  subtitle: string
  icon: LucideIcon
  tone: Tone
  ready: boolean
}

interface Props {
  guide: DestinationGuide
  tripId: string
  days: ItineraryDay[]
  activities: Activity[]
  readiness: TripAudioguideReadiness | string[] | undefined
  canEdit: boolean
  /** Se está trayendo su contenido de Wikipedia/Wikivoyage. */
  importing: boolean
  /** Hay más de un destino: se ofrece ordenarlos. */
  canReorder: boolean
  onImport: () => void
  onRename: () => void
  onAssignDays: () => void
  onReorder: () => void
  onDelete: () => void
  /** `null` = sección nueva. */
  onEditSection: (section: GuideSection | null) => void
  onDeleteSection: (section: GuideSection) => void
}

/** Todo lo de UN destino: datos rápidos, sus audioguías y las secciones de contenido. */
export function DestinationView({
  guide, tripId, days, activities, readiness, canEdit, importing, canReorder,
  onImport, onRename, onAssignDays, onReorder, onDelete, onEditSection, onDeleteSection,
}: Props) {
  const sections = guide.sections ?? []
  const filled = sections.filter(s => s.body.trim()).length
  // Secciones desplegadas. De entrada, la primera: el resto se abre al tocar su título.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(sections[0] ? [sections[0].id] : []))
  const alternar = (id: string) => setAbiertas(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const facts = guide.facts ?? {}
  const factEntries = (Object.keys(FACT_LABELS) as (keyof typeof FACT_LABELS)[])
    .filter(k => facts[k]).map(k => ({ k, label: FACT_LABELS[k], Icon: FACT_ICONS[k], value: facts[k]! }))

  const assignedDays = days.filter(d => hasGuide(d, guide.id))

  // Array suelto = forma vieja del valor guardado sin conexión (solo actividades).
  const listas = Array.isArray(readiness)
    ? { activityIds: readiness, dayIds: [] as string[] }
    : { activityIds: readiness?.activityIds ?? [], dayIds: readiness?.dayIds ?? [] }

  // La audioguía cuelga del DÍA, no de la guía: aquí se ofrece la de la ciudad
  // de cada día que pasa por este destino (un mismo sitio en dos días tiene dos
  // paseos distintos) y la de cada visita de esos días. Se listan existan o no.
  const gruposAudio = assignedDays.map(day => {
    const items: AudioguideItem[] = [{
      key: `day:${day.id}`,
      scope: { kind: 'day', id: day.id },
      title: citiesLabel(day) ?? guide.name,
      subtitle: 'Paseo por la ciudad',
      icon: Landmark,
      tone: 'primary',
      ready: listas.dayIds.includes(day.id),
    }]
    const delDia = activities
      .filter(a => a.day_id === day.id)
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.order_index - b.order_index)
    for (const a of delDia) {
      const ready = listas.activityIds.includes(a.id)
      // Las visitas (sitios y actividades) admiten audioguía; un vuelo o un
      // hotel solo salen si alguien ya se la hizo.
      if (!ready && a.type !== 'place' && a.type !== 'activity') continue
      items.push({
        key: `activity:${a.id}`,
        scope: { kind: 'activity', id: a.id },
        title: a.title,
        subtitle: a.start_time ? `Visita · ${a.start_time.slice(0, 5)}` : 'Visita',
        icon: ACTIVITY_ICONS[a.type] ?? Landmark,
        tone: a.type,
        ready,
      })
    }
    return { day, items }
  })
  const totalAudio = gruposAudio.reduce((n, g) => n + g.items.length, 0)
  const listasAudio = gruposAudio.reduce((n, g) => n + g.items.filter(i => i.ready).length, 0)

  const menu = canEdit ? (
    <Menu
      label={`Opciones de ${guide.name}`}
      triggerSize="md"
      triggerVariant={guide.cover_image_url ? 'photo' : 'secondary'}
      items={[
        { label: 'Cambiar el nombre', icon: Pencil, onSelect: onRename },
        { label: 'Elegir sus días', icon: CalendarDays, onSelect: onAssignDays },
        {
          label: filled > 0 ? 'Volver a importar' : 'Importar información', icon: RefreshCw,
          hint: 'De Wikipedia y Wikivoyage. No pisa lo que hayas editado.',
          disabled: importing, onSelect: onImport,
        },
        canReorder && { label: 'Ordenar destinos', icon: ArrowUpDown, onSelect: onReorder },
        { label: 'Eliminar destino', icon: Trash2, danger: true, separated: true, onSelect: onDelete },
      ]}
    />
  ) : null

  return (
    <div className="space-y-8">
      {/* Cabecera del destino */}
      {guide.cover_image_url ? (
        <div className="relative h-44 overflow-hidden rounded-3xl bg-sunken md:h-56">
          <img src={guide.cover_image_url} alt="" className="size-full object-cover" loading="lazy" />
          <div aria-hidden="true" className="absolute inset-0 photo-scrim" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-6">
            <h2 className="title-hero min-w-0 text-white">{guide.name}</h2>
          </div>
          {menu && <div className="absolute right-3 top-3">{menu}</div>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h2 className="title-hero min-w-0">{guide.name}</h2>
          {menu}
        </div>
      )}

      {/* Datos rápidos */}
      {factEntries.length > 0 && (
        <Section title="Datos rápidos">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {factEntries.map(({ k, label, Icon, value }) => (
              <div key={k} className="rounded-xl bg-sunken px-3.5 py-3">
                <dt className="eyebrow flex items-center gap-1.5">
                  <Icon className="size-3.5 text-primary" aria-hidden="true" /> {label}
                </dt>
                <dd className="mt-1 text-[0.9375rem] font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {/* Audioguías */}
      <Section
        title="Audioguías"
        description={
          assignedDays.length === 0
            ? undefined
            : totalAudio > 0 && listasAudio === totalAudio
              ? 'Todas listas para escuchar.'
              : `${listasAudio} de ${totalAudio} listas para escuchar.`
        }
        action={canEdit && assignedDays.length > 0
          ? <Button size="sm" variant="ghost" onClick={onAssignDays}><CalendarDays /> Días ({assignedDays.length})</Button>
          : undefined}
      >
        {assignedDays.length === 0 ? (
          <Empty
            icon={Headphones}
            title="Di qué días pasas por aquí"
            description={canEdit
              ? `Elige los días del viaje que estás en ${guide.name} y aquí saldrán sus audioguías: la de la ciudad y la de cada visita.`
              : `Todavía no se ha dicho qué días del viaje pasan por ${guide.name}.`}
          >
            {canEdit && <Button variant="soft" onClick={onAssignDays}><CalendarDays /> Elegir días</Button>}
          </Empty>
        ) : (
          <div className="space-y-4">
            {gruposAudio.map(({ day, items }) => (
              <div key={day.id} className="space-y-2">
                <h3 className="eyebrow">{format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })}</h3>
                <RowList>
                  {items.map(item => (
                    <Row
                      key={item.key}
                      icon={item.icon}
                      tone={item.tone}
                      title={item.title}
                      subtitle={item.subtitle}
                      // Lista: se escucha. Sin crear: quien puede editar entra a crearla.
                      to={item.ready || canEdit ? scopeRoute(tripId, item.scope) : undefined}
                      chevron={item.ready || canEdit}
                      trailing={item.ready
                        ? <Badge tone="success" icon={Headphones}>Lista</Badge>
                        : canEdit
                          ? <span className="font-medium text-accent-foreground">Crear audioguía</span>
                          : <Badge>Sin crear</Badge>}
                    />
                  ))}
                </RowList>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Contenido */}
      <Section
        title="Qué conviene saber"
        action={canEdit && sections.length > 0
          ? <Button size="sm" variant="ghost" loading={importing} onClick={onImport}><RefreshCw /> Volver a importar</Button>
          : undefined}
      >
        {sections.length === 0 ? (
          <Empty
            icon={BookOpen}
            title={`Aún no hay información de ${guide.name}`}
            description={canEdit
              ? 'Tráela de Wikipedia y Wikivoyage con un toque, o escríbela tú. Todo se puede editar después.'
              : 'Quien organiza el viaje todavía no la ha añadido.'}
          >
            {canEdit && (
              <>
                <Button variant="soft" loading={importing} onClick={onImport}><DownloadCloud /> Importar información</Button>
                <Button variant="outline" onClick={() => onEditSection(null)}><Plus /> Nueva sección</Button>
              </>
            )}
          </Empty>
        ) : (
          <div className="space-y-3">
            {sections.map(s => {
              const Icon = sectionIcon(s.id)
              const abierta = abiertas.has(s.id)
              const cuerpoId = `seccion-${guide.id}-${s.id}`
              return (
                <Card key={s.id} pad="none" className="overflow-hidden">
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => alternar(s.id)}
                      aria-expanded={abierta}
                      aria-controls={cuerpoId}
                      className="flex min-h-15 min-w-0 flex-1 items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/70"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-foreground">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="title-card min-w-0 flex-1">{s.title}</span>
                      <ChevronDown
                        className={cn('size-4.5 shrink-0 text-muted-foreground transition-transform duration-200', abierta && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>
                    {canEdit && (
                      <div className="shrink-0 pr-2.5">
                        <Menu
                          label={`Opciones de «${s.title}»`}
                          triggerSize="md"
                          items={[
                            { label: 'Editar', icon: Pencil, onSelect: () => onEditSection(s) },
                            { label: 'Eliminar sección', icon: Trash2, danger: true, separated: true, onSelect: () => onDeleteSection(s) },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                  {abierta && (
                    <div id={cuerpoId} className="border-t border-border px-4 py-4 md:px-5">
                      {s.body.trim() ? (
                        <Markdown content={s.body} />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Sin información todavía.{canEdit ? ' Abre el menú «⋯» y elige «Editar» para escribirla.' : ''}
                        </p>
                      )}
                      {s.url && s.source && s.source !== 'manual' && (
                        <a
                          href={s.url} target="_blank" rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          <ExternalLink className="size-3.5" aria-hidden="true" /> Fuente: {s.source} (CC BY-SA)
                        </a>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
            {canEdit && (
              <Button variant="outline" block onClick={() => onEditSection(null)}>
                <Plus /> Nueva sección
              </Button>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}
