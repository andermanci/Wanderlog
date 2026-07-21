import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bookmark, Star, MapPin, Plus, Pencil, Trash2, ExternalLink, Calendar, Search, FolderOpen, BookOpen, Link2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TripHeader } from '@/components/trips/TripHeader'
import { AddToItineraryDialog, type PendingPlace } from '@/components/places/AddToItineraryDialog'
import { useFavoritePlaces, useUpdateFavoritePlace, useDeleteFavoritePlace } from '@/lib/queries/places'
import { useDestinationGuides } from '@/lib/queries/guide'
import { PlaceIcon } from '@/components/places/PlaceIcon'
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS } from '@/lib/utils'
import type { FavoritePlace } from '@/types/database'

const NONE = '__none'

export function SavedPlacesPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: places, isLoading } = useFavoritePlaces(tripId!)
  const { data: guides } = useDestinationGuides(tripId!)
  const updatePlace = useUpdateFavoritePlace()
  const deletePlace = useDeleteFavoritePlace()

  const guideNameById = useMemo(() => new Map((guides ?? []).map(g => [g.id, g.name])), [guides])

  const [editing, setEditing] = useState<FavoritePlace | null>(null)
  const [editCollection, setEditCollection] = useState('')
  const [editGuideId, setEditGuideId] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editLink, setEditLink] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<FavoritePlace | null>(null)
  const [addItinerary, setAddItinerary] = useState<PendingPlace | null>(null)

  // Nombres de colección existentes (para el datalist al editar).
  const collections = useMemo(
    () => Array.from(new Set((places ?? []).map(p => p.collection?.trim()).filter(Boolean) as string[])).sort(),
    [places],
  )

  // Agrupar por colección; "Sin lista" al final.
  const groups = useMemo(() => {
    const m = new Map<string, FavoritePlace[]>()
    ;(places ?? []).forEach(p => {
      const k = p.collection?.trim() || NONE
      m.set(k, [...(m.get(k) ?? []), p])
    })
    return Array.from(m.entries()).sort(([a], [b]) =>
      a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b))
  }, [places])

  function openEdit(p: FavoritePlace) {
    setEditing(p)
    setEditCollection(p.collection ?? '')
    setEditGuideId(p.guide_id ?? '')
    setEditNotes(p.notes ?? '')
    setEditLink(p.link ?? '')
  }
  async function saveEdit() {
    if (!editing) return
    await updatePlace.mutateAsync({
      id: editing.id,
      collection: editCollection.trim() || null,
      guide_id: editGuideId || null,
      notes: editNotes.trim() || null,
      link: editLink.trim() || null,
    })
    setEditing(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Lugares" />
      <div className="flex items-center justify-between mb-8 gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-medium">Lugares guardados</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Tus opciones e ideas, organizadas en listas</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button asChild variant="outline" className="gap-2" title="Añadir un sitio desde un enlace de TikTok, Instagram o una web">
            <Link to={`/import/shared?trip=${tripId}`}><Link2 size={16} /> <span className="hidden sm:inline">Desde enlace</span></Link>
          </Button>
          <Button asChild className="gap-2" variant="brand">
            <Link to={`/trips/${tripId}/map`}><Search size={16} /> Buscar lugares</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !places?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bookmark size={48} className="mb-4 text-muted-foreground" />
          <h3 className="font-serif text-2xl mb-2">Sin lugares guardados</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Busca sitios en el mapa y guárdalos como opción (restaurantes, bares, miradores…),
            sin tener que meterlos en un día concreto.
          </p>
          <Button asChild className="mt-6 gap-2" variant="brand">
            <Link to={`/trips/${tripId}/map`}><Search size={16} /> Buscar en el mapa</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([collection, items]) => (
            <section key={collection}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-serif text-lg font-medium">
                  {collection === NONE ? 'Sin lista' : collection}
                </h2>
                <Badge variant="outline" className="text-xs">{items.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-xl p-4 flex flex-col gap-2 surface"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${PLACE_CATEGORY_COLORS[p.category]}1f` }}>
                        <PlaceIcon category={p.category} size={18} style={{ color: PLACE_CATEGORY_COLORS[p.category] }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-1">{p.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-xs text-muted-foreground">{PLACE_CATEGORY_LABELS[p.category]}</span>
                          {p.rating && (
                            <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--primary)' }}>
                              <Star size={10} fill="var(--primary)" /> {p.rating}
                            </span>
                          )}
                          {p.guide_id && guideNameById.has(p.guide_id) && (
                            <Link to={`/trips/${tripId}/guide`}
                              className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded-full hover:opacity-80"
                              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
                              <BookOpen size={10} /> {guideNameById.get(p.guide_id)}
                            </Link>
                          )}
                        </div>
                        {p.address && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{p.address}</p>}
                      </div>
                    </div>

                    {p.notes && <p className="text-sm text-muted-foreground line-clamp-2">{p.notes}</p>}

                    <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                        <Link to={`/trips/${tripId}/map?place=${p.id}`}><MapPin size={12} /> Mapa</Link>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                        onClick={() => setAddItinerary({ name: p.name, address: p.address, link: p.link, place_id: p.google_place_id, lat: p.lat, lng: p.lng, category: p.category })}>
                        <Calendar size={12} /> Itinerario
                      </Button>
                      {p.link && (
                        <Button size="icon" variant="ghost" className="w-8 h-8" asChild aria-label="Enlace" title="Enlace">
                          <a href={p.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => openEdit(p)} aria-label="Editar" title="Editar">
                        <Pencil size={13} />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive ml-auto"
                        onClick={() => setDeleteTarget(p)} aria-label="Eliminar" title="Eliminar">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Editar lugar (lista, nota, enlace) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="surface">
          <DialogHeader>
            <DialogTitle className="font-serif truncate pr-6">{editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Lista</Label>
              <Input list="place-collections" value={editCollection} onChange={(e) => setEditCollection(e.target.value)}
                placeholder="Ej: Favoritos de Roma" />
              <datalist id="place-collections">
                {collections.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            {(guides?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Destino (guía)</Label>
                <select value={editGuideId} onChange={(e) => setEditGuideId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:border-primary">
                  <option value="">Sin destino</option>
                  {guides!.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nota</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Por qué te interesa, qué pedir…" />
            </div>
            <div className="space-y-1.5">
              <Label>Enlace (menú, Instagram, artículo…)</Label>
              <Input value={editLink} onChange={(e) => setEditLink(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={updatePlace.isPending} onClick={saveEdit}
              variant="brand">
              <Plus size={14} className="mr-1.5" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddToItineraryDialog
        open={!!addItinerary}
        onOpenChange={(o) => !o && setAddItinerary(null)}
        tripId={tripId!}
        place={addItinerary}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar lugar?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteTarget?.name}</strong> de tus lugares guardados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deletePlace.mutate({ id: deleteTarget.id, tripId: tripId! }); setDeleteTarget(null) }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
