import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Field, Input, Notice, Select } from '@/design'
import { useCreateDocument, useUpdateDocument, type NewDocument } from '@/lib/queries/documents'
import { DOCUMENT_LABELS, PERSONAL_DOC_CATEGORIES, isFileDoc } from '@/lib/utils'
import type { Document, Traveler } from '@/types/database'
import { FileField } from './FileField'
import { IdPhotoInput } from './IdPhotoInput'
import { PanelFooter } from './PanelSlots'

interface PersonalDocFormProps {
  tripId: string
  /** Si se pasa, se edita; si no, se crea. */
  doc?: Document
  /** Viajero de partida al crear. */
  travelerId?: string
  travelers: Traveler[]
  onSaved: () => void
  onCancel: () => void
  /** Ir a dar de alta un viajero (cuando aún no hay ninguno). */
  onAddTraveler: () => void
}

// DNI, pasaporte, carnet, tarjeta sanitaria (foto por las dos caras) y visado o
// vacunas (un archivo suelto).
export function PersonalDocForm({ tripId, doc, travelerId, travelers, onSaved, onCancel, onAddTraveler }: PersonalDocFormProps) {
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()
  const [category, setCategory] = useState<string>(doc?.category ?? 'dni')
  const [traveler, setTraveler] = useState(doc ? doc.traveler_id ?? '' : travelerId ?? '')
  const [number, setNumber] = useState(doc?.confirmation_number ?? '')
  const [expiry, setExpiry] = useState(doc?.datetime_end?.slice(0, 10) ?? '')
  const [front, setFront] = useState<string | null>(doc?.file_url ?? null)
  const [back, setBack] = useState<string | null>(doc?.back_url ?? null)
  const [busy, setBusy] = useState(0)
  const trackBusy = (b: boolean) => setBusy(n => Math.max(0, n + (b ? 1 : -1)))
  const asFile = isFileDoc(category)

  async function submit() {
    const payload: NewDocument = {
      trip_id: tripId,
      category: category as Document['category'],
      title: DOCUMENT_LABELS[category] ?? 'Documento',
      traveler_id: traveler || null,
      confirmation_number: category === 'vaccines' ? null : number.trim() || null,
      datetime_end: expiry || null,
      file_url: front,
      back_url: asFile ? null : back,
      locator: null, provider: null, link: null, datetime_start: null,
      origin: null, destination: null, seat: null, phone: null, notes: null,
      flight_number: null,
    }
    try {
      if (doc) await updateDoc.mutateAsync({ id: doc.id, ...payload })
      else await createDoc.mutateAsync(payload)
      onSaved()
    } catch {
      // El aviso de error ya lo da la consulta.
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo de documento">
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            {PERSONAL_DOC_CATEGORIES.map(k => <option key={k} value={k}>{DOCUMENT_LABELS[k]}</option>)}
          </Select>
        </Field>
        <Field label="¿De quién es?">
          <Select value={traveler} onChange={e => setTraveler(e.target.value)}>
            <option value="">Sin asignar</option>
            {travelers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>

      {travelers.length === 0 && (
        <Notice
          tone="info"
          icon={UserPlus}
          action={<Button variant="outline" size="sm" onClick={onAddTraveler}>Añadir viajero</Button>}
        >
          Todavía no hay viajeros. Añade uno para saber de quién es cada documento.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {category !== 'vaccines' && (
          <Field label="Número" optional>
            <Input value={number} onChange={e => setNumber(e.target.value)} placeholder="XX0000000" className="font-mono" autoCapitalize="characters" />
          </Field>
        )}
        <Field label="Caduca el" optional hint="Te avisaremos si le quedan menos de 6 meses.">
          <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
        </Field>
      </div>

      {asFile ? (
        <FileField
          label="Archivo"
          hint="El PDF o la foto del documento."
          value={front}
          tripId={tripId}
          onChange={setFront}
          onBusyChange={trackBusy}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <IdPhotoInput label="Anverso" value={front} tripId={tripId} onChange={setFront} onBusyChange={trackBusy} />
          <IdPhotoInput label="Reverso" value={back} tripId={tripId} onChange={setBack} onBusyChange={trackBusy} />
        </div>
      )}

      <PanelFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          loading={createDoc.isPending || updateDoc.isPending}
          disabled={busy > 0}
          onClick={submit}
        >
          {doc ? 'Guardar cambios' : 'Añadir'}
        </Button>
      </PanelFooter>
    </div>
  )
}
