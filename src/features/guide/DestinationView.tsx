import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowUpDown, BookOpen, Bus, CalendarClock, CalendarDays, Coins, DownloadCloud,
  ExternalLink, FileText, Headphones, Landmark, Languages, Pencil, Phone, Plus,
  RefreshCw, ShieldCheck, Trash2, Users, Utensils, Wifi, type LucideIcon,
} from 'lucide-react'
import { ACTIVITY_ICONS, Button, Chip, Menu, type Tone } from '@/design'
import { citiesLabel, hasGuide } from '@/lib/cities'
import { scopeRoute, type AudioguideScope } from '@/lib/audioguide/scope'
import type { TripAudioguideReadiness } from '@/lib/queries/audioguides'
import type { Activity, DestinationGuide, GuideSection, ItineraryDay } from '@/types/database'
import { Markdown } from './Markdown'
import { TrackRow } from './TrackRow'

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

// Los datos de la franja, en el orden en que se leen. Emergencias va aparte:
// es un botón de llamada, no un dato más.
const FACT_LABELS = { currency: 'Moneda', plug: 'Enchufe', voltage: 'Voltaje', languages: 'Idioma', callingCode: 'Prefijo' } as const

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
  const filled = sections.filter(s => s.body?.trim()).length
  const sectionDomId = (id: string) => `seccion-${guide.id}-${id}`
  const irASeccion = (id: string) =>
    document.getElementById(sectionDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const facts = guide.facts ?? {}
  const factEntries = (Object.keys(FACT_LABELS) as (keyof typeof FACT_LABELS)[])
    .filter(k => facts[k]).map(k => ({ k, label: FACT_LABELS[k], value: facts[k]! }))
  // Solo se ofrece llamar si el dato es UN número limpio: de un texto con
  // varios («110 / 119») no se puede sacar a cuál marcar.
  const emergencyText = facts.emergency?.trim() ?? ''
  const emergencyDial = /^\+?[\d\s-]+$/.test(emergencyText) ? emergencyText.replace(/[^\d+]/g, '') : ''

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


  const diasTexto = assignedDays.length === 0
    ? null
    : assignedDays.length === 1 ? '1 día del viaje' : `${assignedDays.length} días del viaje`

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        {/* Portada de la guía: la foto a sangre con el nombre encima; sin foto, color y tipografía. */}
        {guide.cover_image_url ? (
          <div className="relative -mx-4 h-64 overflow-hidden bg-sunken md:mx-0 md:h-80 md:rounded-3xl">
            <img src={guide.cover_image_url} alt="" className="size-full object-cover" loading="lazy" />
            <div aria-hidden="true" className="absolute inset-0 photo-scrim" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-8">
              <p className="text-2xs font-semibold uppercase tracking-widest text-white/80">
                Guía del destino{diasTexto ? ` · ${diasTexto}` : ''}
              </p>
              <h2 className="mt-1.5 font-serif text-5xl font-medium leading-none tracking-tight break-words md:text-7xl">
                {guide.name}
              </h2>
            </div>
            {menu && <div className="absolute right-3 top-3 md:right-4 md:top-4">{menu}</div>}
          </div>
        ) : (
          <div className="relative -mx-4 bg-primary-soft px-5 pb-6 pt-14 md:mx-0 md:rounded-3xl md:px-8 md:pb-8 md:pt-20">
            <p className="eyebrow">Guía del destino{diasTexto ? ` · ${diasTexto}` : ''}</p>
            <h2 className="mt-1.5 font-serif text-5xl font-medium leading-none tracking-tight break-words text-accent-foreground md:text-7xl">
              {guide.name}
            </h2>
            {menu && <div className="absolute right-3 top-3 md:right-4 md:top-4">{menu}</div>}
          </div>
        )}

        {/* Datos rápidos: una franja de datos, y emergencias como botón de llamada. */}
        {(factEntries.length > 0 || facts.emergency) && (
          <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between md:gap-6">
            {factEntries.length > 0 && (
              <dl
                aria-label="Datos rápidos"
                className="no-scrollbar -mx-4 flex min-w-0 divide-x divide-border overflow-x-auto px-4 md:mx-0 md:px-0"
              >
                {factEntries.map(({ k, label, value }) => (
                  <div key={k} className="shrink-0 px-4 first:pl-0 last:pr-0">
                    <dt className="eyebrow">{label}</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {facts.emergency && (
              emergencyDial ? (
                <a
                  href={`tel:${emergencyDial}`}
                  data-tone="danger"
                  className="inline-flex min-h-12 shrink-0 items-center gap-3 self-start rounded-full border border-tone-line bg-tone-soft py-1.5 pl-1.5 pr-5 text-tone transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.97] md:self-auto"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tone text-white">
                    <Phone className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-2xs font-semibold uppercase tracking-wider">Emergencias</span>
                    <span className="block text-[0.9375rem] font-semibold tabular-nums">Llamar al {facts.emergency}</span>
                  </span>
                </a>
              ) : (
                <div data-tone="danger" className="shrink-0">
                  <p className="eyebrow text-tone">Emergencias</p>
                  <p className="mt-0.5 text-[0.9375rem] font-semibold">{facts.emergency}</p>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Audioguías: cada una, una pista */}
      <section aria-labelledby={`audioguias-${guide.id}`} className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 id={`audioguias-${guide.id}`} className="title-section">Audioguías</h3>
            {assignedDays.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {totalAudio > 0 && listasAudio === totalAudio
                  ? 'Todas listas para escuchar.'
                  : `${listasAudio} de ${totalAudio} listas para escuchar.`}
              </p>
            )}
          </div>
          {canEdit && assignedDays.length > 0 && (
            <Button size="sm" variant="ghost" onClick={onAssignDays}><CalendarDays /> Días ({assignedDays.length})</Button>
          )}
        </header>

        {assignedDays.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-sunken p-5 sm:flex-row sm:items-center">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-muted-foreground">
              <Headphones className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg font-medium tracking-tight">Di qué días pasas por aquí</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {canEdit
                  ? `Elige los días del viaje que estás en ${guide.name} y aquí saldrán sus audioguías: la de la ciudad y la de cada visita.`
                  : `Todavía no se ha dicho qué días del viaje pasan por ${guide.name}.`}
              </p>
            </div>
            {canEdit && <Button variant="soft" onClick={onAssignDays}><CalendarDays /> Elegir días</Button>}
          </div>
        ) : (
          <div className="space-y-7">
            {gruposAudio.map(({ day, items }) => {
              const [ciudad, ...visitas] = items
              const pista = (item: AudioguideItem, featured: boolean) => (
                <TrackRow
                  key={item.key}
                  featured={featured}
                  ready={item.ready}
                  icon={item.icon}
                  tone={item.tone}
                  title={item.title}
                  meta={item.subtitle}
                  // Lista: se escucha. Sin crear: quien puede editar entra a crearla.
                  to={item.ready || canEdit ? scopeRoute(tripId, item.scope) : undefined}
                  trailing={item.ready
                    ? <span className="font-medium text-accent-foreground">Escuchar</span>
                    : canEdit
                      ? <span className="font-medium text-muted-foreground group-hover:text-foreground">Crear</span>
                      : <span className="text-muted-foreground">Sin crear</span>}
                />
              )
              return (
                <div key={day.id}>
                  <h4 className="eyebrow mb-2.5 flex items-center gap-3">
                    <span className="shrink-0">{format(parseISO(day.date), "EEEE d 'de' MMMM", { locale: es })}</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  </h4>
                  {pista(ciudad, true)}
                  {visitas.length > 0 && (
                    <ul className="mt-1 divide-y divide-border">
                      {visitas.map(item => <li key={item.key} className="py-0.5">{pista(item, false)}</li>)}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Qué conviene saber: un artículo, con su índice arriba */}
      <section aria-labelledby={`saber-${guide.id}`}>
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h3 id={`saber-${guide.id}`} className="title-section">Qué conviene saber</h3>
          {canEdit && sections.length > 0 && (
            <Button size="sm" variant="ghost" loading={importing} onClick={onImport}><RefreshCw /> Volver a importar</Button>
          )}
        </header>

        {sections.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-sunken px-5 py-8 md:px-8">
            <p className="font-serif text-2xl font-medium tracking-tight">Aún no hay información de {guide.name}</p>
            <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
              {canEdit
                ? 'Tráela de Wikipedia y Wikivoyage con un toque, o escríbela tú. Todo se puede editar después.'
                : 'Quien organiza el viaje todavía no la ha añadido.'}
            </p>
            {canEdit && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="soft" loading={importing} onClick={onImport}><DownloadCloud /> Importar información</Button>
                <Button variant="outline" onClick={() => onEditSection(null)}><Plus /> Nueva sección</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Índice: cada chip baja a su sección */}
            <nav
              aria-label="Secciones de la guía"
              className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
            >
              {sections.map(s => (
                <Chip key={s.id} icon={sectionIcon(s.id)} onClick={() => irASeccion(s.id)}>{s.title}</Chip>
              ))}
            </nav>

            <div className="mt-5 divide-y divide-border border-y border-border">
              {sections.map((s, i) => (
                <article key={s.id} id={sectionDomId(s.id)} className="scroll-mt-28 py-8">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow tabular-nums">{String(i + 1).padStart(2, '0')}</p>
                      <h4 className="mt-1 font-serif text-2xl font-medium leading-tight tracking-tight md:text-3xl">{s.title}</h4>
                    </div>
                    {canEdit && (
                      <Menu
                        label={`Opciones de «${s.title}»`}
                        triggerSize="md"
                        items={[
                          { label: 'Editar', icon: Pencil, onSelect: () => onEditSection(s) },
                          { label: 'Eliminar sección', icon: Trash2, danger: true, separated: true, onSelect: () => onDeleteSection(s) },
                        ]}
                      />
                    )}
                  </header>
                  <div className="mt-4 max-w-prose">
                    {s.body?.trim() ? (
                      <Markdown content={s.body} />
                    ) : (
                      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                        Sin información todavía.{canEdit ? ' Abre el menú «⋯» y elige «Editar» para escribirla.' : ''}
                      </p>
                    )}
                    {s.url && s.source && s.source !== 'manual' && (
                      <a
                        href={s.url} target="_blank" rel="noreferrer"
                        className="mt-5 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" /> Fuente: {s.source} (CC BY-SA)
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {canEdit && (
              <Button variant="outline" className="mt-5" onClick={() => onEditSection(null)}>
                <Plus /> Nueva sección
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
