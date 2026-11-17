import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BookOpen, GripVertical, Plus, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button, Checkbox, Chip, Confirm, Empty, Field, Input, Notice, Page, Panel, Skeleton, Textarea,
} from '@/design'
import { cn } from '@/lib/utils'
import { useTrip } from '@/lib/queries/trips'
import { useItineraryDays, useActivities, useUpdateDayCities } from '@/lib/queries/itinerary'
import { useTripRole, canEditRole } from '@/lib/queries/sharing'
import { addCity, dayCities, hasGuide, removeGuide } from '@/lib/cities'
import { useTripAudioguidesReadiness } from '@/lib/queries/audioguides'
import {
  useDestinationGuides, useAddDestinationGuide, useUpdateDestinationGuide, useDeleteDestinationGuide, useReorderGuides,
} from '@/lib/queries/guide'
import { fetchDestinationInfo } from '@/lib/destinationInfo'
import type { DestinationGuide, GuideSection, ItineraryDay } from '@/types/database'
import { DestinationView } from './DestinationView'

const DIACRITICS = /[̀-ͯ]/g
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()

// Al volver a importar, lo editado a mano se conserva y lo demás se refresca.
function mergeSections(prev: GuideSection[], fetched: GuideSection[]): GuideSection[] {
  const existing = new Map(prev.map(s => [s.id, s]))
  const seen = new Set<string>()
  const merged = fetched.map(f => {
    seen.add(f.id)
    const old = existing.get(f.id)
    return old?.edited ? old : f
  })
  for (const s of prev) if (!seen.has(s.id)) merged.push(s)
  return merged
}

// Un solo panel abierto cada vez: cuál y sobre qué.
type PanelState =
  | { kind: 'add'; detect: boolean }
  | { kind: 'rename' }
  | { kind: 'days' }
  | { kind: 'order' }
  | { kind: 'section'; section: GuideSection | null }
  | null

export function GuidePage() {
  const { tripId } = useParams()
  const { data: trip } = useTrip(tripId!)
  const { data: guides, isLoading } = useDestinationGuides(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: activities } = useActivities(tripId!)
  const { data: role } = useTripRole(tripId!)
  // Misma consulta que usa el plan: React Query la comparte.
  const { data: readiness } = useTripAudioguidesReadiness(tripId!)
  const canEdit = canEditRole(role)

  const addGuide = useAddDestinationGuide()
  const updateGuide = useUpdateDestinationGuide()
  const deleteGuide = useDeleteDestinationGuide()
  const reorderGuides = useReorderGuides()
  const setDayCities = useUpdateDayCities()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelState>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sectionToDelete, setSectionToDelete] = useState<GuideSection | null>(null)

  const list = useMemo(() => guides ?? [], [guides])
  const guide = list.find(g => g.id === selectedId) ?? list[0]
  const allDays = useMemo(() => days ?? [], [days])

  // Sitios que ya aparecen en el viaje y aún no tienen guía: las ciudades
  // escritas en los días y el destino del viaje.
  const candidates = useMemo(() => {
    const seen = new Set(list.map(g => normalize(g.name)))
    const out: string[] = []
    const push = (raw: string) => {
      const name = raw.trim()
      const k = normalize(name)
      if (!k || seen.has(k)) return
      seen.add(k)
      out.push(name)
    }
    for (const d of allDays) for (const c of dayCities(d)) if (!c.guide_id) push(c.name)
    for (const t of (trip?.destination ?? '').split(/[,/&]| y | and /i)) push(t)
    return out
  }, [list, allDays, trip?.destination])

  async function importInto(g: Pick<DestinationGuide, 'id' | 'name'>, prevSections: GuideSection[]) {
    const info = await fetchDestinationInfo(g.name)
    await updateGuide.mutateAsync({
      id: g.id, tripId: tripId!,
      sections: mergeSections(prevSections, info.sections),
      coverImageUrl: info.coverImageUrl ?? null,
      facts: info.facts,
      markImported: true,
    })
  }

  // Los días que ya tenían escrita esta ciudad (sin guía) quedan unidos a la
  // guía nueva: así salen sus audioguías sin tener que marcarlos uno a uno.
  async function linkDays(created: DestinationGuide) {
    const key = normalize(created.name)
    for (const d of allDays) {
      const cities = dayCities(d)
      if (!cities.some(c => !c.guide_id && normalize(c.name) === key)) continue
      await setDayCities.mutateAsync({
        id: d.id, tripId: tripId!,
        cities: cities.map(c => (!c.guide_id && normalize(c.name) === key ? { ...c, guide_id: created.id } : c)),
      }).catch(() => {})
    }
  }

  async function addAndImport(names: string[]) {
    const clean = names.map(n => n.trim()).filter(Boolean)
    if (!clean.length) return
    let last: DestinationGuide | null = null
    try {
      // De uno en uno: son pocas y así se ve por cuál va.
      for (const name of clean) {
        setAdding(name)
        const created = await addGuide.mutateAsync({ tripId: tripId!, name })
        last = created
        await linkDays(created)
        try {
          await importInto(created, [])
        } catch {
          toast.error(`${name} está añadido, pero no hemos podido traer su información. Puedes escribirla tú.`)
        }
      }
      if (last) {
        setSelectedId(last.id)
        toast.success(clean.length === 1 ? `Guía de ${clean[0]} creada` : `${clean.length} guías creadas`)
      }
      setPanel(null)
    } catch {
      /* el aviso ya lo da la mutación */
    } finally {
      setAdding(null)
    }
  }

  async function reimport(g: DestinationGuide) {
    setImportingId(g.id)
    try {
      await importInto(g, g.sections ?? [])
      toast.success(`Guía de ${g.name} actualizada`)
    } catch {
      toast.error('No hemos podido traer la información. Puedes escribirla tú.')
    } finally {
      setImportingId(null)
    }
  }

  function openDetect() {
    if (candidates.length === 0) {
      toast.info('No hay destinos nuevos en tu viaje. Puedes añadir uno por su nombre.')
      setPanel({ kind: 'add', detect: false })
      return
    }
    setPanel({ kind: 'add', detect: true })
  }

  const close = () => setPanel(null)

  return (
    <Page
      title="Guía"
      subtitle="Lo práctico de cada sitio del viaje y sus audioguías."
      actions={canEdit && list.length > 0 ? (
        <>
          <Button variant="outline" onClick={openDetect} disabled={!!adding}><Wand2 /> Detectar destinos</Button>
          <Button variant="primary" onClick={() => setPanel({ kind: 'add', detect: false })} disabled={!!adding}>
            <Plus /> Añadir destino
          </Button>
        </>
      ) : undefined}
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !guide ? (
        <Empty
          icon={BookOpen}
          title="Tu guía está vacía"
          description={canEdit
            ? 'Aquí tendrás, por cada sitio del viaje, lo que conviene saber (moneda, enchufes, idioma, costumbres…) y sus audioguías. Empieza por los sitios que ya aparecen en tu viaje.'
            : 'Aquí aparecerá lo que conviene saber de cada sitio del viaje y sus audioguías, cuando quien lo organiza lo añada.'}
        >
          {canEdit && (
            <>
              <Button variant="primary" onClick={openDetect}><Wand2 /> Detectar destinos</Button>
              <Button variant="outline" onClick={() => setPanel({ kind: 'add', detect: false })}><Plus /> Añadir por nombre</Button>
            </>
          )}
        </Empty>
      ) : (
        <div className="space-y-6">
          {/* Destinos: uno a la vez */}
          {list.length > 1 && (
            <div
              role="group" aria-label="Destinos"
              className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
            >
              {list.map(g => (
                <Chip key={g.id} selected={g.id === guide.id} onClick={() => setSelectedId(g.id)}>{g.name}</Chip>
              ))}
            </div>
          )}

          <DestinationView
            key={guide.id}
            guide={guide}
            tripId={tripId!}
            days={allDays}
            activities={activities ?? []}
            readiness={readiness}
            canEdit={canEdit}
            importing={importingId === guide.id}
            canReorder={list.length > 1}
            onImport={() => reimport(guide)}
            onRename={() => setPanel({ kind: 'rename' })}
            onAssignDays={() => setPanel({ kind: 'days' })}
            onReorder={() => setPanel({ kind: 'order' })}
            onDelete={() => setConfirmDelete(true)}
            onEditSection={section => setPanel({ kind: 'section', section })}
            onDeleteSection={setSectionToDelete}
          />
        </div>
      )}

      {/* Los paneles se montan al abrirse: así su formulario nace con los datos del momento. */}
      {panel?.kind === 'add' && (
        <AddPanel
          candidates={candidates} preselect={panel.detect} adding={adding}
          onClose={close} onAdd={addAndImport}
        />
      )}
      {panel?.kind === 'rename' && guide && (
        <RenamePanel
          guide={guide} saving={updateGuide.isPending} onClose={close}
          onSave={async name => {
            await updateGuide.mutateAsync({ id: guide.id, tripId: tripId!, name })
            close()
          }}
        />
      )}
      {panel?.kind === 'days' && guide && (
        <DaysPanel
          guide={guide} days={allDays} onClose={close}
          onToggle={(day, checked) => {
            // Marcar/desmarcar el día suma o quita ESTE destino: los demás que
            // tuviera el día (un día puede ser dos ciudades) se quedan como están.
            const cities = checked
              ? addCity(dayCities(day), { name: guide.name, guide_id: guide.id })
              : removeGuide(dayCities(day), guide.id)
            setDayCities.mutate({ id: day.id, cities, tripId: tripId! })
          }}
          onAuto={() => {
            // Autoasignar: días cuyas actividades (título/dirección) mencionan la ciudad.
            const target = normalize(guide.name)
            let n = 0
            for (const d of allDays) {
              const acts = (activities ?? []).filter(a => a.day_id === d.id)
              const text = normalize(acts.map(a => `${a.title} ${a.address ?? ''}`).join(' '))
              if (text.includes(target) && !hasGuide(d, guide.id)) {
                setDayCities.mutate({
                  id: d.id, tripId: tripId!,
                  cities: addCity(dayCities(d), { name: guide.name, guide_id: guide.id }),
                })
                n++
              }
            }
            if (n) toast.success(n === 1 ? `1 día marcado para ${guide.name}` : `${n} días marcados para ${guide.name}`)
            else toast.info(`Ningún día menciona ${guide.name} en sus actividades.`)
          }}
        />
      )}
      {panel?.kind === 'order' && (
        <OrderPanel
          guides={list} onClose={close}
          onReorder={ids => reorderGuides.mutate({ tripId: tripId!, order: ids.map((id, i) => ({ id, order_index: i })) })}
        />
      )}
      {panel?.kind === 'section' && guide && (
        <SectionPanel
          section={panel.section} saving={updateGuide.isPending} onClose={close}
          onSave={async (title, body) => {
            const sections = guide.sections ?? []
            const editing = panel.section
            const next = editing
              ? sections.map(x => (x.id === editing.id ? { ...x, title: title || editing.title, body, edited: true } : x))
              : [...sections, { id: `custom-${Date.now()}`, title: title || 'Nueva sección', body, source: 'manual' as const, edited: true }]
            await updateGuide.mutateAsync({ id: guide.id, tripId: tripId!, sections: next })
            close()
          }}
        />
      )}

      <Confirm
        danger
        open={confirmDelete && !!guide}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar la guía de ${guide?.name ?? ''}?`}
        description="Se borran esta guía y todas sus secciones. Tus días, tus actividades y sus audioguías no se tocan."
        confirmLabel="Eliminar"
        loading={deleteGuide.isPending}
        onConfirm={() => {
          if (!guide) return
          deleteGuide.mutate({ id: guide.id, tripId: tripId! }, {
            onSuccess: () => { setConfirmDelete(false); setSelectedId(null) },
          })
        }}
      />
      <Confirm
        danger
        open={!!sectionToDelete}
        onOpenChange={o => { if (!o) setSectionToDelete(null) }}
        title={`¿Eliminar «${sectionToDelete?.title ?? ''}»?`}
        description="Se borra el texto de esta sección. Si era importada, puedes recuperarla volviendo a importar."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (guide && sectionToDelete) {
            updateGuide.mutate({
              id: guide.id, tripId: tripId!,
              sections: (guide.sections ?? []).filter(x => x.id !== sectionToDelete.id),
            })
          }
          setSectionToDelete(null)
        }}
      />
    </Page>
  )
}

// ── Paneles ──────────────────────────────────────────────────────────────

function AddPanel({ candidates, preselect, adding, onClose, onAdd }: {
  candidates: string[]
  /** Se ha entrado por «Detectar destinos»: los detectados salen ya marcados. */
  preselect: boolean
  /** Nombre del destino que se está creando ahora, o null. */
  adding: string | null
  onClose: () => void
  onAdd: (names: string[]) => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect ? candidates : []))
  const names = [...(name.trim() ? [name.trim()] : []), ...candidates.filter(c => picked.has(c))]
  const busy = !!adding

  return (
    <Panel
      open
      onOpenChange={o => { if (!o && !busy) onClose() }}
      title={preselect ? 'Destinos de tu viaje' : 'Añadir destino'}
      description="Traemos su información de Wikipedia y Wikivoyage. Después podrás editarla."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={names.length === 0} onClick={() => onAdd(names)}>
            {names.length > 1 ? `Añadir ${names.length} destinos` : 'Añadir e importar'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={e => { e.preventDefault(); if (names.length && !busy) onAdd(names) }}
      >
        {candidates.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-medium">Aparecen en tu viaje y no tienen guía</legend>
            {candidates.map(c => {
              const id = `detectado-${normalize(c).replace(/\s+/g, '-')}`
              return (
                <div key={c} className="flex min-h-11 items-center gap-3 rounded-md px-1">
                  <Checkbox
                    id={id} checked={picked.has(c)} disabled={busy}
                    onCheckedChange={v => setPicked(prev => {
                      const next = new Set(prev)
                      if (v) next.add(c); else next.delete(c)
                      return next
                    })}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-2 text-[0.9375rem]">{c}</label>
                </div>
              )
            })}
          </fieldset>
        )}
        <Field
          label={candidates.length > 0 ? 'Otro destino' : 'Nombre del destino'}
          hint="Una ciudad, una región o un país. Por ejemplo: Singapur, Bali."
          optional={candidates.length > 0}
        >
          <Input
            value={name} onChange={e => setName(e.target.value)} disabled={busy}
            placeholder="Singapur" autoFocus={!preselect} autoComplete="off"
          />
        </Field>
        {adding && <Notice tone="info">Creando la guía de {adding}…</Notice>}
      </form>
    </Panel>
  )
}

function RenamePanel({ guide, saving, onClose, onSave }: {
  guide: DestinationGuide
  saving: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(guide.name)
  const clean = name.trim()
  return (
    <Panel
      open onOpenChange={o => { if (!o) onClose() }}
      title="Cambiar el nombre"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!clean} onClick={() => onSave(clean)}>Guardar</Button>
        </>
      }
    >
      <form onSubmit={e => { e.preventDefault(); if (clean) onSave(clean) }}>
        <Field label="Nombre del destino" hint="Si vuelves a importar, se buscará con este nombre.">
          <Input value={name} onChange={e => setName(e.target.value)} autoFocus autoComplete="off" />
        </Field>
      </form>
    </Panel>
  )
}

function DaysPanel({ guide, days, onClose, onToggle, onAuto }: {
  guide: DestinationGuide
  days: ItineraryDay[]
  onClose: () => void
  onToggle: (day: ItineraryDay, checked: boolean) => void
  onAuto: () => void
}) {
  return (
    <Panel
      open onOpenChange={o => { if (!o) onClose() }}
      title={`Días en ${guide.name}`}
      description="Marca los días del viaje que pasan por aquí. Un día puede estar en varias ciudades."
      footer={
        <>
          <Button variant="outline" onClick={onAuto} disabled={days.length === 0}><Wand2 /> Marcar por nombre</Button>
          <Button variant="primary" onClick={onClose}>Hecho</Button>
        </>
      }
    >
      {days.length === 0 ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted-foreground">
          El viaje aún no tiene días. Ponle fechas y vuelve aquí.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {days.map(d => {
            const mine = hasGuide(d, guide.id)
            // Las otras ciudades del día, para ver de un vistazo con qué se comparte
            const others = dayCities(d).filter(c => c.guide_id !== guide.id).map(c => c.name).join(' · ')
            const id = `dia-${d.id}`
            return (
              <li key={d.id} className="flex min-h-12 items-center gap-3 rounded-md px-1 hover:bg-secondary/70">
                <Checkbox id={id} checked={mine} onCheckedChange={v => onToggle(d, v)} />
                <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-3 py-2.5">
                  <span className="text-[0.9375rem] first-letter:uppercase">
                    {format(parseISO(d.date), "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                  {others && <span className="max-w-[45%] truncate text-sm text-muted-foreground">{others}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function OrderPanel({ guides, onClose, onReorder }: {
  guides: DestinationGuide[]
  onClose: () => void
  onReorder: (ids: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = guides.map(g => g.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const reordered = [...ids]
    reordered.splice(to, 0, reordered.splice(from, 1)[0])
    onReorder(reordered)
  }

  return (
    <Panel
      open onOpenChange={o => { if (!o) onClose() }}
      title="Ordenar destinos"
      description="Arrastra cada destino por el asa para ponerlos en el orden del viaje."
      footer={<Button variant="primary" onClick={onClose}>Hecho</Button>}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={guides.map(g => g.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {guides.map((g, i) => <SortableGuide key={g.id} guide={g} position={i + 1} />)}
          </ul>
        </SortableContext>
      </DndContext>
    </Panel>
  )
}

function SortableGuide({ guide, position }: { guide: DestinationGuide; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: guide.id })
  return (
    <li
      ref={setNodeRef}
      // Posición del arrastre: es el único estilo que viene de un cálculo en vivo.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex min-h-14 items-center gap-2 rounded-xl border border-border bg-card pl-1.5 pr-4',
        isDragging && 'relative z-10 shadow-raised',
      )}
    >
      <button
        type="button"
        {...attributes} {...listeners}
        aria-label={`Mover ${guide.name}`}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">{position}</span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{guide.name}</span>
    </li>
  )
}

function SectionPanel({ section, saving, onClose, onSave }: {
  /** `null` = sección nueva. */
  section: GuideSection | null
  saving: boolean
  onClose: () => void
  onSave: (title: string, body: string) => void
}) {
  const [title, setTitle] = useState(section?.title ?? '')
  const [body, setBody] = useState(section?.body ?? '')
  return (
    <Panel
      open onOpenChange={o => { if (!o) onClose() }}
      size="lg"
      title={section ? 'Editar sección' : 'Nueva sección'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary" loading={saving}
            disabled={!section && !title.trim() && !body.trim()}
            onClick={() => onSave(title.trim(), body)}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Título">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Propinas, apps útiles…" autoFocus={!section} />
        </Field>
        <Field
          label="Contenido"
          hint="Puedes dar formato con Markdown: **negrita**, listas con «- », subtítulos con «## » y [enlaces](https://…)."
        >
          <Textarea
            value={body} onChange={e => setBody(e.target.value)} rows={16}
            placeholder="Escribe aquí lo que quieras recordar…"
            className="font-mono text-sm"
          />
        </Field>
      </div>
    </Panel>
  )
}
