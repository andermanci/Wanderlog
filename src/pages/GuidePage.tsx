import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  BookOpen, Users, Languages, Utensils, ShieldCheck, Bus, FileText, Coins, CalendarClock, Wifi,
  Loader2, Plus, Pencil, Trash2, RefreshCw, ExternalLink, Check, X, ChevronDown, MapPin,
  GripVertical, CalendarDays, Phone, Plug, Zap, Hash, Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { TripHeader } from '@/components/trips/TripHeader'
import { MarkdownView } from '@/components/MarkdownView'
import { useTrip } from '@/lib/queries/trips'
import { useItineraryDays, useActivities, useUpdateDayGuide } from '@/lib/queries/itinerary'
import {
  useDestinationGuides, useAddDestinationGuide, useUpdateDestinationGuide, useDeleteDestinationGuide, useReorderGuides,
} from '@/lib/queries/guide'
import { fetchDestinationInfo } from '@/lib/destinationInfo'
import type { DestinationGuide, GuideSection, ItineraryDay, Activity } from '@/types/database'
import { toast } from 'sonner'

function sectionIcon(id: string) {
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

const DIACRITICS = /[̀-ͯ]/g
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACRITICS, '')

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

export function GuidePage() {
  const { tripId } = useParams()
  const { data: trip } = useTrip(tripId!)
  const { data: guides, isLoading } = useDestinationGuides(tripId!)
  const { data: days } = useItineraryDays(tripId!)
  const { data: activities } = useActivities(tripId!)
  const addGuide = useAddDestinationGuide()
  const updateGuide = useUpdateDestinationGuide()
  const reorderGuides = useReorderGuides()

  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [detectList, setDetectList] = useState<string[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  async function importInto(guideId: string, name: string, prevSections: GuideSection[]) {
    const info = await fetchDestinationInfo(name)
    await updateGuide.mutateAsync({
      id: guideId, tripId: tripId!,
      sections: mergeSections(prevSections, info.sections),
      coverImageUrl: info.coverImageUrl ?? null,
      facts: info.facts,
      markImported: true,
    })
  }

  async function addAndImport(name: string) {
    const clean = name.trim()
    if (!clean) return
    setAdding(true)
    try {
      const guide = await addGuide.mutateAsync({ tripId: tripId!, name: clean })
      setNewName('')
      try {
        await importInto(guide.id, clean, [])
        toast.success(`Guía de ${clean} importada`)
      } catch {
        toast.error(`Destino añadido, pero no se pudo importar ${clean}. Edítalo a mano.`)
      }
    } finally {
      setAdding(false)
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !guides) return
    const ids = guides.map(g => g.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const reordered = [...ids]
    reordered.splice(to, 0, reordered.splice(from, 1)[0])
    reorderGuides.mutate({ tripId: tripId!, order: reordered.map((id, i) => ({ id, order_index: i })) })
  }

  function detectDestinations() {
    if (!trip?.destination) return
    const tokens = trip.destination.split(/[,/&]| y | and /i).map(t => t.trim()).filter(Boolean)
    const existing = new Set((guides ?? []).map(g => normalize(g.name)))
    const toCreate = tokens.filter(t => !existing.has(normalize(t)))
    if (!toCreate.length) { toast('No hay destinos nuevos que detectar'); return }
    setDetectList(toCreate)
  }

  async function runDetect() {
    const list = detectList ?? []
    setDetectList(null)
    for (const t of list) await addAndImport(t)
  }

  const hasGuides = (guides?.length ?? 0) > 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Guía" />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-2xl font-medium">Guía del destino</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Una guía por cada lugar de tu viaje — historia, costumbres, idioma, comida y consejos.
          </p>
        </div>
        {trip?.destination && (
          <Button variant="outline" size="sm" className="gap-2" onClick={detectDestinations} disabled={adding}>
            <Wand2 size={15} />
            Detectar destinos
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={(guides ?? []).map(g => g.id)} strategy={verticalListSortingStrategy}>
              {guides?.map(g => (
                <DestinationGuideBlock
                  key={g.id} guide={g} tripId={tripId!}
                  days={days} activities={activities} guides={guides}
                  defaultOpen={guides.length <= 2}
                  onImport={(prev) => importInto(g.id, g.name, prev)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Añadir un destino nuevo */}
          <div className="rounded-xl border border-dashed border-border p-4">
            {!hasGuides && (
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}>
                  <BookOpen size={22} style={{ color: 'var(--primary)' }} />
                </div>
                <h2 className="font-serif text-lg font-medium">Añade los lugares de tu viaje</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mt-1">
                  Escribe un destino (p. ej. Singapur) e impórtalo desde Wikivoyage y Wikipedia. Luego podrás editarlo.
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !adding) addAndImport(newName) }}
                  placeholder="Nombre del destino (Singapur, Bali…)"
                  className="pl-9"
                  disabled={adding}
                />
              </div>
              <Button
                className="gap-2 sm:w-auto"
                onClick={() => addAndImport(newName)}
                disabled={adding || !newName.trim()}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
              >
                {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Añadir e importar
              </Button>
            </div>
            {!hasGuides && trip?.destination && (
              <button onClick={() => addAndImport(trip.destination)} disabled={adding}
                className="mt-3 text-sm text-primary hover:underline disabled:opacity-50">
                + Importar {trip.destination} (destino del viaje)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmar creación de destinos detectados */}
      <AlertDialog open={!!detectList} onOpenChange={(o) => !o && setDetectList(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Crear guías de destino?</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán e importarán guías para: <strong>{(detectList ?? []).join(', ')}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runDetect}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              Crear e importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const FACT_ICONS = { currency: Coins, languages: Languages, emergency: Phone, plug: Plug, voltage: Zap, callingCode: Hash } as const
const FACT_LABELS = { currency: 'Moneda', languages: 'Idioma', emergency: 'Emergencias', plug: 'Enchufe', voltage: 'Voltaje', callingCode: 'Prefijo' } as const

function DestinationGuideBlock({ guide, tripId, days, activities, guides, defaultOpen, onImport }: {
  guide: DestinationGuide; tripId: string
  days: ItineraryDay[] | undefined; activities: Activity[] | undefined; guides: DestinationGuide[]
  defaultOpen: boolean; onImport: (prev: GuideSection[]) => Promise<void>
}) {
  const update = useUpdateDestinationGuide()
  const del = useDeleteDestinationGuide()
  const setDayGuide = useUpdateDayGuide()

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: guide.id })

  const [open, setOpen] = useState(defaultOpen)
  const [importing, setImporting] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(guide.name)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [daysOpen, setDaysOpen] = useState(false)

  const sections = guide.sections ?? []
  const filled = sections.filter(s => s.body.trim()).length
  const busy = update.isPending || importing
  const assignedDays = (days ?? []).filter(d => d.guide_id === guide.id)
  const facts = guide.facts ?? {}
  const factEntries = (Object.keys(FACT_LABELS) as (keyof typeof FACT_LABELS)[])
    .filter(k => facts[k]).map(k => ({ k, label: FACT_LABELS[k], Icon: FACT_ICONS[k], value: facts[k]! }))

  async function persist(next: GuideSection[]) { await update.mutateAsync({ id: guide.id, tripId, sections: next }) }

  async function reimport() {
    setImporting(true)
    try { await onImport(sections); toast.success(`Guía de ${guide.name} actualizada`) }
    catch { toast.error('No se pudo importar. Prueba a editarla a mano.') }
    finally { setImporting(false) }
  }

  async function saveName() {
    await update.mutateAsync({ id: guide.id, tripId, name: nameDraft.trim() || guide.name })
    setEditingName(false)
  }

  function startEdit(s: GuideSection) { setEditingId(s.id); setDraftTitle(s.title); setDraftBody(s.body) }
  function cancelEdit() { setEditingId(null); setDraftTitle(''); setDraftBody('') }
  async function saveEdit(s: GuideSection) {
    await persist(sections.map(x => x.id === s.id ? { ...x, title: draftTitle.trim() || s.title, body: draftBody, edited: true } : x))
    cancelEdit()
  }
  async function deleteSection(s: GuideSection) { await persist(sections.filter(x => x.id !== s.id)) }
  async function addSection() {
    const id = `custom-${Date.now()}`
    await persist([...sections, { id, title: 'Nueva sección', body: '', source: 'manual', edited: true }])
    setOpen(true); setEditingId(id); setDraftTitle('Nueva sección'); setDraftBody('')
  }

  function toggleDay(day: ItineraryDay, checked: boolean) {
    setDayGuide.mutate({ id: day.id, guideId: checked ? guide.id : null, tripId })
  }

  // Autoasignar: días cuyas actividades (título/dirección) mencionan la ciudad.
  function autoAssign() {
    const target = normalize(guide.name)
    let n = 0
    for (const d of (days ?? [])) {
      const acts = (activities ?? []).filter(a => a.day_id === d.id)
      const text = normalize(acts.map(a => `${a.title} ${a.address ?? ''}`).join(' '))
      if (text.includes(target) && d.guide_id !== guide.id) {
        setDayGuide.mutate({ id: d.id, guideId: guide.id, tripId })
        n++
      }
    }
    if (n) toast.success(`${n} día(s) asignados a ${guide.name}`)
    else toast(`Sin coincidencias para ${guide.name}`)
  }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-xl border border-border overflow-hidden">
      {/* Portada */}
      {guide.cover_image_url && (
        <div className="relative h-24 w-full">
          <img src={guide.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,15,0.55), transparent 70%)' }} />
          <span className="absolute bottom-2 left-3 font-serif text-lg font-medium text-white drop-shadow">{guide.name}</span>
        </div>
      )}

      {/* Cabecera del destino */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}>
        <button {...attributes} {...listeners} onClick={e => e.stopPropagation()}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing" aria-label="Arrastrar para ordenar" title="Arrastrar para ordenar">
          <GripVertical size={16} />
        </button>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <ChevronDown size={18} className="text-muted-foreground flex-shrink-0" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          {!guide.cover_image_url && <MapPin size={16} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />}
          {editingName ? (
            <Input value={nameDraft} onChange={e => setNameDraft(e.target.value)} onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }} className="h-8 font-serif text-lg max-w-[240px]" autoFocus />
          ) : (
            <h2 className="font-serif text-lg font-medium truncate">{guide.name}</h2>
          )}
          {!editingName && (
            <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">
              {filled > 0 ? `${filled} secc.` : 'sin importar'}{assignedDays.length ? ` · ${assignedDays.length}d` : ''}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {editingName ? (
            <>
              <Button size="icon" variant="ghost" className="w-8 h-8 text-primary" onClick={saveName} aria-label="Guardar" title="Guardar"><Check size={16} /></Button>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => { setEditingName(false); setNameDraft(guide.name) }} aria-label="Cancelar" title="Cancelar"><X size={16} /></Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setDaysOpen(true)} aria-label="Asignar días">
                <CalendarDays size={14} /><span className="hidden sm:inline">Días{assignedDays.length ? ` (${assignedDays.length})` : ''}</span>
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={reimport} disabled={busy}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">{filled > 0 ? 'Reimportar' : 'Importar'}</span>
              </Button>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => { setEditingName(true); setNameDraft(guide.name) }} aria-label="Renombrar destino" title="Renombrar destino"><Pencil size={14} /></Button>
              <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                onClick={() => setConfirmDel(true)} aria-label="Eliminar destino"><Trash2 size={14} aria-hidden="true" /></Button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-border">
              {/* Datos rápidos */}
              {factEntries.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  {factEntries.map(({ k, label, Icon, value }) => (
                    <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border" style={{ background: 'var(--secondary)' }}>
                      <Icon size={13} style={{ color: 'var(--primary)' }} />
                      <span className="text-muted-foreground">{label}:</span>
                      <span className="font-medium">{value}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="p-4 space-y-3">
                {sections.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    Pulsa <span className="font-medium text-foreground">Importar</span> para traer la información de {guide.name}, o añade una sección a mano.
                  </div>
                ) : sections.map(s => {
                  const Icon = sectionIcon(s.id)
                  const editing = editingId === s.id
                  return (
                    <div key={s.id} className="rounded-lg border border-border" style={{ background: 'var(--background)' }}>
                      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          <Icon size={16} style={{ color: 'var(--primary)' }} />
                        </span>
                        {editing ? (
                          <Input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className="h-8 font-medium" placeholder="Título" />
                        ) : (
                          <h3 className="font-medium text-sm flex-1 min-w-0 truncate">{s.title}</h3>
                        )}
                        {editing ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-primary" onClick={() => saveEdit(s)} disabled={busy} aria-label="Guardar" title="Guardar"><Check size={15} /></Button>
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={cancelEdit} aria-label="Cancelar" title="Cancelar"><X size={15} /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => startEdit(s)} aria-label="Editar sección" title="Editar sección"><Pencil size={13} /></Button>
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => deleteSection(s)} aria-label="Eliminar sección" title="Eliminar sección"><Trash2 size={13} /></Button>
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        {editing ? (
                          <div className="space-y-1.5">
                            <Textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={10}
                              placeholder="Escribe aquí la información…" className="resize-y font-mono text-xs leading-relaxed" />
                            <p className="text-xs text-muted-foreground">Admite <span className="font-medium">Markdown</span>: **negrita**, listas con «- », ## subtítulos, [enlaces](url).</p>
                          </div>
                        ) : s.body.trim() ? (
                          <MarkdownView content={s.body} />
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Sin información. Pulsa el lápiz para añadirla.</p>
                        )}
                        {!editing && s.url && s.source && s.source !== 'manual' && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink size={11} /> Fuente: {s.source} (CC BY-SA)
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}

                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={addSection} disabled={busy}>
                  <Plus size={14} /> Añadir sección
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo: asignar días a este destino */}
      <Dialog open={daysOpen} onOpenChange={setDaysOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Días en {guide.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Marca los días de tu viaje que transcurren en {guide.name}.</p>
          <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {(days ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay días en el itinerario.</p>
            ) : (days ?? []).map(d => {
              const mine = d.guide_id === guide.id
              const otherName = d.guide_id && !mine ? guides.find(g => g.id === d.guide_id)?.name : null
              return (
                <label key={d.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary cursor-pointer">
                  <Checkbox checked={mine} onCheckedChange={(v) => toggleDay(d, v === true)} />
                  <span className="text-sm capitalize flex-1">{format(parseISO(d.date), "EEE d 'de' MMM", { locale: es })}</span>
                  {otherName && <span className="text-xs text-muted-foreground">{otherName}</span>}
                </label>
              )
            })}
          </div>
          <div className="flex justify-between gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="gap-2" onClick={autoAssign}>
              <Wand2 size={14} /> Autoasignar por nombre
            </Button>
            <Button size="sm" onClick={() => setDaysOpen(false)}>Hecho</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado del destino */}
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar la guía de {guide.name}?</AlertDialogTitle>
            <AlertDialogDescription>Se borrará esta guía de destino y todas sus secciones. No afecta a tus días ni lugares.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => del.mutate({ id: guide.id, tripId })}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
