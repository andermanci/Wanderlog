import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, CalendarPlus, ExternalLink, Lightbulb, Link2, Pencil, Search, SearchX, Star, Trash2 } from 'lucide-react'
import {
  Badge, Button, Chip, Confirm, Empty, Input, Menu, PlaceIcon, Row, RowList, Section, Skeleton, useIsMobile,
} from '@/design'
import { useDeleteFavoritePlace, useFavoritePlaces } from '@/lib/queries/places'
import { useDestinationGuides } from '@/lib/queries/guide'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { cn, PLACE_CATEGORY_LABELS } from '@/lib/utils'
import type { FavoritePlace } from '@/types/database'
import { usePlanStore } from '../planStore'
import { AddToPlanPanel, type PendingPlace } from './AddToPlanPanel'
import { PlaceEditPanel } from './PlaceEditPanel'
import { openLink, pendingFromFavorite } from './places'

const NONE = '__sin_lista'

/**
 * La pestaña «Ideas» del Plan: los lugares guardados del viaje, por listas.
 * Va dentro de la columna con scroll del Plan (no pinta página ni cabecera).
 */
export function IdeasList({ tripId }: { tripId: string }) {
  const { data: places, isLoading } = useFavoritePlaces(tripId)
  const { data: guides } = useDestinationGuides(tripId)
  const { data: role, isLoading: roleLoading } = useTripRole(tripId)
  const canEdit = canEditRole(role)
  const deletePlace = useDeleteFavoritePlace()
  const focusOnMap = usePlanStore(s => s.focusOnMap)
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState<FavoritePlace | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FavoritePlace | null>(null)
  const [adding, setAdding] = useState<PendingPlace | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [pendingAddId, setPendingAddId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  // Contrato de URL: `?place=<id>` lleva hasta ese lugar y lo resalta;
  // `?place=<id>&anadir=1` abre además «Añadir al plan». Se apunta al verlo
  // (aunque los lugares aún estén cargando) y se limpia de la URL enseguida.
  const urlPlace = searchParams.get('place')
  const urlAdd = searchParams.get('anadir') === '1'
  const [seenUrlPlace, setSeenUrlPlace] = useState<string | null>(null)
  if (urlPlace !== seenUrlPlace) {
    setSeenUrlPlace(urlPlace)
    if (urlPlace) {
      setHighlightId(urlPlace)
      if (urlAdd) setPendingAddId(urlPlace)
      // Que ningún filtro lo esconda.
      setQuery('')
      setCategory('all')
    }
  }
  useEffect(() => {
    if (!searchParams.has('place') && !searchParams.has('anadir')) return
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('place')
      next.delete('anadir')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  // «Añadir al plan» pedido por URL: se abre en cuanto el lugar está cargado
  // (y se sabe si quien mira puede editar).
  if (pendingAddId && places && !roleLoading) {
    const target = places.find(p => p.id === pendingAddId)
    setPendingAddId(null)
    if (target && canEdit) setAdding(pendingFromFavorite(target))
  }

  // Desplaza hasta el lugar resaltado y apaga el resalte al rato.
  const loaded = !!places
  useEffect(() => {
    if (!highlightId || !loaded) return
    rowRefs.current.get(highlightId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => setHighlightId(null), 2600)
    return () => clearTimeout(t)
  }, [highlightId, loaded])

  const guideNameById = useMemo(() => new Map((guides ?? []).map(g => [g.id, g.name])), [guides])

  // Categorías que hay de verdad entre lo guardado, con cuántos lugares cada una.
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    ;(places ?? []).forEach(p => counts.set(p.category, (counts.get(p.category) ?? 0) + 1))
    return Object.keys(PLACE_CATEGORY_LABELS).filter(c => counts.has(c)).map(c => ({ key: c, count: counts.get(c)! }))
  }, [places])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (places ?? []).filter(p =>
      (category === 'all' || p.category === category)
      && (!q || [p.name, p.notes, p.address, p.collection].some(t => t?.toLowerCase().includes(q))))
  }, [places, query, category])

  // Agrupados por lista; «Sin lista» al final.
  const groups = useMemo(() => {
    const m = new Map<string, FavoritePlace[]>()
    filtered.forEach(p => {
      const k = p.collection?.trim() || NONE
      m.set(k, [...(m.get(k) ?? []), p])
    })
    return Array.from(m.entries()).sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)))
  }, [filtered])

  function showOnMap(p: FavoritePlace) {
    focusOnMap({ kind: 'place', id: p.id })
    if (isMobile) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('vista', 'mapa')
        return next
      })
    }
  }

  function searchPlaces() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('buscar', '1')
      if (isMobile) next.set('vista', 'mapa')
      return next
    })
  }

  const importFromLink = () => navigate(`/import/shared?trip=${tripId}`)

  const headerActions = (
    <>
      <Button variant="soft" size="sm" onClick={searchPlaces}><Search /> Buscar lugares</Button>
      {canEdit && <Button variant="outline" size="sm" onClick={importFromLink}><Link2 /> Importar desde un enlace</Button>}
    </>
  )

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-11 w-full rounded-md" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
      </div>
    )
  }

  if (!places?.length) {
    return (
      <Empty
        icon={Lightbulb}
        title="Aún no tienes ideas guardadas"
        description={canEdit
          ? 'Las ideas son sitios que te apetece ver: un restaurante, un mirador, una tienda. Guárdalos aquí y luego decides qué día.'
          : 'Las ideas son sitios que apetece ver en el viaje. Todavía no hay ninguno guardado.'}
      >
        <Button variant="primary" onClick={searchPlaces}><Search /> Buscar lugares</Button>
        {canEdit && <Button variant="outline" onClick={importFromLink}><Link2 /> Importar desde un enlace</Button>}
      </Empty>
    )
  }

  return (
    <div className="@container space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">{headerActions}</div>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar entre tus ideas"
            aria-label="Buscar entre tus ideas"
            className="pl-10"
          />
        </div>
        {categories.length > 1 && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Filtrar por tipo de lugar">
            <Chip selected={category === 'all'} onClick={() => setCategory('all')} count={places.length}>Todas</Chip>
            {categories.map(c => (
              <Chip key={c.key} selected={category === c.key} count={c.count}
                onClick={() => setCategory(k => (k === c.key ? 'all' : c.key))}>
                {PLACE_CATEGORY_LABELS[c.key]}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <Empty icon={SearchX} title="Ningún lugar coincide" description="Prueba con otra palabra o quita los filtros.">
          <Button onClick={() => { setQuery(''); setCategory('all') }}>Quitar filtros</Button>
        </Empty>
      ) : groups.map(([collection, items]) => (
        <Section
          key={collection}
          title={collection === NONE ? 'Sin lista' : collection}
          action={<Badge>{items.length}</Badge>}
        >
          <RowList>
            {items.map(p => {
              const guideName = p.guide_id ? guideNameById.get(p.guide_id) : undefined
              return (
                <div
                  key={p.id}
                  ref={el => { if (el) rowRefs.current.set(p.id, el); else rowRefs.current.delete(p.id) }}
                  className={cn('transition-colors duration-500', highlightId === p.id && 'bg-primary-soft')}
                >
                  <Row
                    onClick={() => showOnMap(p)}
                    leading={
                      <span data-tone={p.category} className="grid size-10 shrink-0 place-items-center rounded-full bg-tone-soft text-tone">
                        <PlaceIcon category={p.category} className="size-5" />
                      </span>
                    }
                    title={p.name}
                    subtitle={p.notes || p.address || PLACE_CATEGORY_LABELS[p.category]}
                    trailing={p.rating != null && (
                      <span className="hidden items-center gap-1 tabular-nums @lg:flex" aria-label={`Valoración ${p.rating} de 5`}>
                        <Star className="size-3.5" aria-hidden="true" /> {p.rating}
                      </span>
                    )}
                    after={
                      <>
                        {canEdit && (
                          <Button variant="soft" size="sm" aria-label={`Añadir ${p.name} al plan`} onClick={() => setAdding(pendingFromFavorite(p))}>
                            <CalendarPlus /> Añadir<span className="hidden @lg:inline"> al plan</span>
                          </Button>
                        )}
                        <Menu
                          label={`Más opciones de ${p.name}`}
                          items={[
                            canEdit && { label: 'Editar', hint: 'Lista, nota y enlace', icon: Pencil, onSelect: () => setEditing(p) },
                            !!p.link && { label: 'Abrir enlace', icon: ExternalLink, onSelect: () => openLink(p.link!) },
                            !!guideName && { label: `Ver la guía de ${guideName}`, icon: BookOpen, onSelect: () => navigate(`/trips/${tripId}/guide`) },
                            canEdit && { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => setDeleteTarget(p) },
                          ]}
                        />
                      </>
                    }
                  />
                </div>
              )
            })}
          </RowList>
        </Section>
      ))}

      <PlaceEditPanel tripId={tripId} place={editing} onClose={() => setEditing(null)} />

      <AddToPlanPanel
        open={!!adding}
        onOpenChange={o => { if (!o) setAdding(null) }}
        tripId={tripId}
        place={adding}
      />

      <Confirm
        danger
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        title="¿Eliminar este lugar?"
        description={<>«{deleteTarget?.name}» dejará de estar entre tus lugares guardados. Si ya lo añadiste al plan, esa actividad no se toca.</>}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleteTarget) deletePlace.mutate({ id: deleteTarget.id, tripId })
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
