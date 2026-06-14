import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Users, Languages, Utensils, ShieldCheck, Bus, FileText,
  Loader2, Plus, Pencil, Trash2, RefreshCw, ExternalLink, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { TripHeader } from '@/components/trips/TripHeader'
import { MarkdownView } from '@/components/MarkdownView'
import { useTrip } from '@/lib/queries/trips'
import { useDestinationGuide, useSaveDestinationGuide } from '@/lib/queries/guide'
import { fetchDestinationInfo } from '@/lib/destinationInfo'
import type { GuideSection } from '@/types/database'
import { toast } from 'sonner'

function sectionIcon(id: string) {
  switch (id) {
    case 'resumen': return BookOpen
    case 'costumbres': return Users
    case 'idioma': return Languages
    case 'comida': return Utensils
    case 'seguridad': return ShieldCheck
    case 'moverse': return Bus
    default: return FileText
  }
}

export function GuidePage() {
  const { tripId } = useParams()
  const { data: trip } = useTrip(tripId!)
  const { data: guide, isLoading } = useDestinationGuide(tripId!)
  const save = useSaveDestinationGuide()

  const [importing, setImporting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const sections = guide?.sections ?? []
  const hasContent = sections.some(s => s.body.trim())

  async function persist(next: GuideSection[], markImported = false) {
    await save.mutateAsync({ tripId: tripId!, sections: next, markImported })
  }

  async function doImport() {
    if (!trip?.destination) return
    setImporting(true)
    try {
      const fetched = await fetchDestinationInfo(trip.destination)
      const existing = new Map(sections.map(s => [s.id, s]))
      const seen = new Set<string>()
      // No pisar lo que el usuario haya editado a mano.
      const merged: GuideSection[] = fetched.map(f => {
        seen.add(f.id)
        const prev = existing.get(f.id)
        return prev?.edited ? prev : f
      })
      // Conservar las secciones personalizadas añadidas por el usuario.
      for (const s of sections) if (!seen.has(s.id)) merged.push(s)
      await persist(merged, true)
      toast.success('Información del destino importada')
    } catch {
      toast.error('No se pudo importar la información. Prueba a editarla a mano.')
    } finally {
      setImporting(false)
    }
  }

  function startEdit(s: GuideSection) {
    setEditingId(s.id)
    setDraftTitle(s.title)
    setDraftBody(s.body)
  }
  function cancelEdit() {
    setEditingId(null)
    setDraftTitle('')
    setDraftBody('')
  }
  async function saveEdit(s: GuideSection) {
    const title = draftTitle.trim() || s.title
    const next = sections.map(x => x.id === s.id ? { ...x, title, body: draftBody, edited: true } : x)
    await persist(next)
    cancelEdit()
  }
  async function deleteSection(s: GuideSection) {
    await persist(sections.filter(x => x.id !== s.id))
  }
  async function addSection() {
    const id = `custom-${Date.now()}`
    const next: GuideSection[] = [...sections, { id, title: 'Nueva sección', body: '', source: 'manual', edited: true }]
    await persist(next)
    setEditingId(id)
    setDraftTitle('Nueva sección')
    setDraftBody('')
  }

  const busy = save.isPending || importing

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Guía" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-2xl font-medium">Guía del destino</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {trip?.destination ? `Historia, costumbres y consejos de ${trip.destination}` : 'Historia, costumbres y consejos'}
          </p>
        </div>
        {hasContent && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={doImport} disabled={busy}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Volver a importar
            </Button>
            <Button variant="outline" className="gap-2" onClick={addSection} disabled={busy}>
              <Plus size={16} />
              Añadir sección
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !hasContent && editingId === null ? (
        // Estado vacío: invitar a importar.
        <div className="flex flex-col items-center text-center py-16 px-6 rounded-xl border border-dashed border-border">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}>
            <BookOpen size={24} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="font-serif text-xl font-medium mb-1">Conoce tu destino</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-5">
            Trae historia, costumbres, idioma, comida y consejos de seguridad desde Wikivoyage y
            Wikipedia. Luego podrás editarlo a tu gusto.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button className="gap-2" onClick={doImport} disabled={busy || !trip?.destination}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
              {trip?.destination ? `Importar información de ${trip.destination}` : 'Importar información'}
            </Button>
            <Button variant="outline" className="gap-2" onClick={addSection} disabled={busy}>
              <Plus size={16} />
              Escribir a mano
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((s, idx) => {
            const Icon = sectionIcon(s.id)
            const editing = editingId === s.id
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-border overflow-hidden"
                style={{ background: 'var(--card)' }}
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                    <Icon size={18} style={{ color: 'var(--primary)' }} />
                  </span>
                  {editing ? (
                    <Input value={draftTitle} onChange={e => setDraftTitle(e.target.value)}
                      className="h-9 font-medium" placeholder="Título de la sección" />
                  ) : (
                    <h3 className="font-serif text-lg font-medium flex-1 min-w-0">{s.title}</h3>
                  )}
                  {editing ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-primary"
                        onClick={() => saveEdit(s)} disabled={busy} title="Guardar">
                        <Check size={16} />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={cancelEdit} title="Cancelar">
                        <X size={16} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => startEdit(s)} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                        onClick={() => deleteSection(s)} title="Eliminar">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3">
                  {editing ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        rows={10}
                        placeholder="Escribe aquí la información…"
                        className="resize-y font-mono text-xs leading-relaxed"
                      />
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
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
