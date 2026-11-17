import { useId, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { Button, Field, Input, Panel, Textarea } from '@/design'
import { useFavoritePlaces, useSaveFavoritePlace } from '@/lib/queries/places'
import { placeTypeToCategory } from '@/lib/maps'
import { collectionsOf } from '../ideas/places'
import type { PlaceResult } from './types'

interface Props {
  tripId: string
  /** El resultado de búsqueda que se guarda; `null` cierra el panel. */
  place: PlaceResult | null
  onClose: () => void
  /** Se llama cuando el lugar ya está guardado. */
  onSaved: () => void
}

/** Guardar un sitio encontrado en el mapa como idea, con lista y nota opcionales. */
export function SavePlacePanel({ tripId, place, onClose, onSaved }: Props) {
  const { data: places } = useFavoritePlaces(tripId)
  const saveFavorite = useSaveFavoritePlace()
  const listId = useId()
  const [collection, setCollection] = useState('')
  const [note, setNote] = useState('')

  function close() {
    setCollection('')
    setNote('')
    onClose()
  }

  async function save() {
    if (!place) return
    try {
      await saveFavorite.mutateAsync({
        trip_id: tripId,
        google_place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        lat: place.lat,
        lng: place.lng,
        category: placeTypeToCategory(place.types),
        rating: place.rating ?? null,
        notes: note.trim() || null,
        link: place.url ?? null,
        collection: collection.trim() || null,
      })
    } catch {
      return // el aviso de error ya lo da la mutación
    }
    setCollection('')
    setNote('')
    onSaved()
  }

  return (
    <Panel
      open={!!place}
      onOpenChange={o => { if (!o) close() }}
      title="Guardar lugar"
      description={place?.name}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={saveFavorite.isPending} onClick={save}><Bookmark /> Guardar</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save() }}>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          Se guarda en «Ideas» del plan. Luego decides qué día ir.
        </p>
        <Field label="Lista" optional hint="Para agrupar tus lugares: «Roma», «Para cenar»… Escribe un nombre nuevo o elige una que ya tengas.">
          <Input list={listId} value={collection} onChange={e => setCollection(e.target.value)} placeholder="Sin lista" />
        </Field>
        <datalist id={listId}>
          {collectionsOf(places).map(c => <option key={c} value={c} />)}
        </datalist>
        <Field label="Nota" optional>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Por qué te interesa, qué pedir…" />
        </Field>
      </form>
    </Panel>
  )
}
