import { useId, useState } from 'react'
import { Button, Field, Input, Panel, Select, Textarea } from '@/design'
import { useFavoritePlaces, useUpdateFavoritePlace } from '@/lib/queries/places'
import { useDestinationGuides } from '@/lib/queries/guide'
import type { FavoritePlace } from '@/types/database'
import { collectionsOf } from './places'

interface Props {
  tripId: string
  /** El lugar que se edita; `null` cierra el panel. */
  place: FavoritePlace | null
  onClose: () => void
}

/**
 * EL editor de un lugar guardado: en qué lista está, a qué destino de la guía
 * pertenece, tu nota y un enlace. Lo usan el mapa y la lista de ideas.
 */
export function PlaceEditPanel({ tripId, place, onClose }: Props) {
  const { data: places } = useFavoritePlaces(tripId)
  const { data: guides } = useDestinationGuides(tripId)
  const updatePlace = useUpdateFavoritePlace()
  const listId = useId()

  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [collection, setCollection] = useState('')
  const [guideId, setGuideId] = useState('')
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState('')

  // Al abrirse con otro lugar, el formulario arranca con sus datos.
  const placeId = place?.id ?? null
  if (placeId !== loadedId) {
    setLoadedId(placeId)
    setCollection(place?.collection ?? '')
    setGuideId(place?.guide_id ?? '')
    setNotes(place?.notes ?? '')
    setLink(place?.link ?? '')
  }

  async function save() {
    if (!place) return
    try {
      await updatePlace.mutateAsync({
        id: place.id,
        collection: collection.trim() || null,
        guide_id: guideId || null,
        notes: notes.trim() || null,
        link: link.trim() || null,
      })
    } catch {
      return // el aviso de error ya lo da la mutación
    }
    onClose()
  }

  return (
    <Panel
      open={!!place}
      onOpenChange={o => { if (!o) onClose() }}
      title="Editar lugar"
      description={place?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={updatePlace.isPending} onClick={save}>Guardar cambios</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save() }}>
        <Field label="Lista" optional hint="Agrupa tus lugares como quieras: «Roma», «Para cenar»… Escribe un nombre nuevo o elige una que ya tengas.">
          <Input list={listId} value={collection} onChange={e => setCollection(e.target.value)} placeholder="Sin lista" />
        </Field>
        <datalist id={listId}>
          {collectionsOf(places).map(c => <option key={c} value={c} />)}
        </datalist>

        {(guides?.length ?? 0) > 0 && (
          <Field label="Destino de la guía" optional hint="Así el lugar sale también en la guía de ese destino.">
            <Select value={guideId} onChange={e => setGuideId(e.target.value)}>
              <option value="">Ninguno</option>
              {guides!.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Nota" optional>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Por qué te interesa, qué pedir…" />
        </Field>

        <Field label="Enlace" optional hint="La carta, su Instagram, un artículo…">
          <Input type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" />
        </Field>
      </form>
    </Panel>
  )
}
