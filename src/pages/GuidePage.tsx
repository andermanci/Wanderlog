import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Users, Languages, Utensils, ShieldCheck, Bus, FileText,
  Loader2, Plus, Pencil, Trash2, RefreshCw, ExternalLink, Check, X, ChevronDown, MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { TripHeader } from '@/components/trips/TripHeader'
import { MarkdownView } from '@/components/MarkdownView'
import { useTrip } from '@/lib/queries/trips'
import {
  useDestinationGuides, useAddDestinationGuide, useUpdateDestinationGuide, useDeleteDestinationGuide,
} from '@/lib/queries/guide'
import { fetchDestinationInfo } from '@/lib/destinationInfo'
import type { DestinationGuide, GuideSection } from '@/types/database'
import { toast } from 'sonner'

function sectionIcon(id: string) {
  if (id.startsWith('costumbres')) return Users
  if (id.startsWith('idioma')) return Languages
  if (id.startsWith('comida')) return Utensils
  if (id.startsWith('seguridad')) return ShieldCheck
  if (id.startsWith('moverse')) return Bus
  if (id.startsWith('resumen')) return BookOpen
  return FileText
}

// Combina lo importado con lo existente, sin pisar lo editado a mano ni perder
// las secciones personalizadas.
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
  const addGuide = useAddDestinationGuide()
  const updateGuide = useUpdateDestinationGuide()

  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  async function addAndImport(name: string) {
    const clean = name.trim()
    if (!clean) return
    setAdding(true)
    try {
      const guide = await addGuide.mutateAsync({ tripId: tripId!, name: clean })
      setNewName('')
      try {
        const fetched = await fetchDestinationInfo(clean)
        await updateGuide.mutateAsync({ id: guide.id, tripId: tripId!, sections: mergeSections([], fetched), markImported: true })
        toast.success(`Guía de ${clean} importada`)
      } catch {
        toast.error(`Destino añadido, pero no se pudo importar ${clean}. Edítalo a mano.`)
      }
    } finally {
      setAdding(false)
    }
  }

  const hasGuides = (guides?.length ?? 0) > 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Guía" />

      <div className="mb-6">
        <h1 className="font-serif text-2xl font-medium">Guía del destino</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Una guía por cada lugar de tu viaje — historia, costumbres, idioma, comida y consejos.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {guides?.map(g => (
            <DestinationGuideBlock key={g.id} guide={g} tripId={tripId!} defaultOpen={guides.length <= 2} />
          ))}

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
              <button
                onClick={() => addAndImport(trip.destination)}
                disabled={adding}
                className="mt-3 text-sm text-primary hover:underline disabled:opacity-50"
              >
                + Importar {trip.destination} (destino del viaje)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DestinationGuideBlock({ guide, tripId, defaultOpen }: { guide: DestinationGuide; tripId: string; defaultOpen: boolean }) {
  const update = useUpdateDestinationGuide()
  const del = useDeleteDestinationGuide()

  const [open, setOpen] = useState(defaultOpen)
  const [importing, setImporting] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(guide.name)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const sections = guide.sections ?? []
  const filled = sections.filter(s => s.body.trim()).length
  const busy = update.isPending || importing

  async function persist(next: GuideSection[], markImported = false) {
    await update.mutateAsync({ id: guide.id, tripId, sections: next, markImported })
  }

  async function reimport() {
    setImporting(true)
    try {
      const fetched = await fetchDestinationInfo(guide.name)
      await persist(mergeSections(sections, fetched), true)
      toast.success(`Guía de ${guide.name} actualizada`)
    } catch {
      toast.error('No se pudo importar. Prueba a editarla a mano.')
    } finally {
      setImporting(false)
    }
  }

  async function saveName() {
    const name = nameDraft.trim() || guide.name
    await update.mutateAsync({ id: guide.id, tripId, name })
    setEditingName(false)
  }

  function startEdit(s: GuideSection) { setEditingId(s.id); setDraftTitle(s.title); setDraftBody(s.body) }
  function cancelEdit() { setEditingId(null); setDraftTitle(''); setDraftBody('') }
  async function saveEdit(s: GuideSection) {
    const title = draftTitle.trim() || s.title
    await persist(sections.map(x => x.id === s.id ? { ...x, title, body: draftBody, edited: true } : x))
    cancelEdit()
  }
  async function deleteSection(s: GuideSection) {
    await persist(sections.filter(x => x.id !== s.id))
  }
  async function addSection() {
    const id = `custom-${Date.now()}`
    await persist([...sections, { id, title: 'Nueva sección', body: '', source: 'manual', edited: true }])
    setOpen(true)
    setEditingId(id); setDraftTitle('Nueva sección'); setDraftBody('')
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Cabecera del destino */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)' }}>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <ChevronDown size={18} className="text-muted-foreground transition-transform flex-shrink-0"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          <MapPin size={16} style={{ color: 'var(--primary)' }} className="flex-shrink-0" />
          {editingName ? (
            <Input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              className="h-8 font-serif text-lg max-w-[260px]"
              autoFocus
            />
          ) : (
            <h2 className="font-serif text-lg font-medium truncate">{guide.name}</h2>
          )}
          {!editingName && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {filled > 0 ? `${filled} ${filled === 1 ? 'sección' : 'secciones'}` : 'sin importar'}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {editingName ? (
            <>
              <Button size="icon" variant="ghost" className="w-8 h-8 text-primary" onClick={saveName} title="Guardar"><Check size={16} /></Button>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => { setEditingName(false); setNameDraft(guide.name) }} title="Cancelar"><X size={16} /></Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={reimport} disabled={busy}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">{filled > 0 ? 'Reimportar' : 'Importar'}</span>
              </Button>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => { setEditingName(true); setNameDraft(guide.name) }} title="Renombrar"><Pencil size={14} /></Button>
              <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`¿Eliminar la guía de ${guide.name}?`)) del.mutate({ id: guide.id, tripId }) }} title="Eliminar destino"><Trash2 size={14} /></Button>
            </>
          )}
        </div>
      </div>

      {/* Secciones */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3 border-t border-border">
              {sections.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Pulsa <span className="font-medium text-foreground">Importar</span> para traer la información de {guide.name}, o añade una sección a mano.
                </div>
              ) : (
                sections.map(s => {
                  const Icon = sectionIcon(s.id)
                  const editing = editingId === s.id
                  return (
                    <div key={s.id} className="rounded-lg border border-border" style={{ background: 'var(--background)' }}>
                      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          <Icon size={16} style={{ color: 'var(--primary)' }} />
                        </span>
                        {editing ? (
                          <Input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className="h-8 font-medium" placeholder="Título" />
                        ) : (
                          <h3 className="font-medium text-sm flex-1 min-w-0 truncate">{s.title}</h3>
                        )}
                        {editing ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-primary" onClick={() => saveEdit(s)} disabled={busy} title="Guardar"><Check size={15} /></Button>
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={cancelEdit} title="Cancelar"><X size={15} /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => startEdit(s)} title="Editar"><Pencil size={13} /></Button>
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => deleteSection(s)} title="Eliminar"><Trash2 size={13} /></Button>
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        {editing ? (
                          <div className="space-y-1.5">
                            <Textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={10}
                              placeholder="Escribe aquí la información…" className="resize-y font-mono text-xs leading-relaxed" />
                            <p className="text-xs text-muted-foreground">
                              Admite <span className="font-medium">Markdown</span>: **negrita**, listas con «- », ## subtítulos, [enlaces](url).
                            </p>
                          </div>
                        ) : s.body.trim() ? (
                          <MarkdownView content={s.body} />
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Sin información. Pulsa el lápiz para añadirla.</p>
                        )}
                        {!editing && s.url && s.source && s.source !== 'manual' && (
                          <a href={s.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink size={11} />
                            Fuente: {s.source} (CC BY-SA)
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })
              )}

              <Button variant="outline" size="sm" className="gap-2 w-full" onClick={addSection} disabled={busy}>
                <Plus size={14} />
                Añadir sección
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
