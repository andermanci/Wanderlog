import { useRef, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowRight, CalendarDays, ImagePlus, MapPin, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Field, IconButton, Input, Panel, Select, Spinner, Textarea } from '@/design'
import { cn, currencySymbol, STATUS_LABELS } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useCreateTrip, useTrip, useUpdateTrip } from '@/lib/queries/trips'
import { useUiStore } from '@/shell/uiStore'
import type { Trip } from '@/types/database'

interface Values {
  name: string
  destination: string
  description: string
  start_date: string
  end_date: string
  status: Trip['status']
  budget_total: string
  tags: string[]
  cover_image_url: string | null
}

const EMPTY: Values = {
  name: '', destination: '', description: '', start_date: '', end_date: '',
  status: 'planning', budget_total: '', tags: [], cover_image_url: null,
}

const fromTrip = (t: Trip): Values => ({
  name: t.name,
  destination: t.destination,
  description: t.description ?? '',
  start_date: t.start_date,
  end_date: t.end_date,
  status: t.status,
  budget_total: t.budget_total != null ? String(t.budget_total) : '',
  tags: t.tags,
  cover_image_url: t.cover_image_url,
})

type Errors = Partial<Record<keyof Values, string>>

function validate(v: Values, only?: (keyof Values)[]): Errors {
  const e: Errors = {}
  if (!v.destination.trim()) e.destination = 'Dinos a dónde vas.'
  if (!v.name.trim()) e.name = 'Ponle un nombre al viaje.'
  if (!v.start_date) e.start_date = 'Elige el día que sales.'
  if (!v.end_date) e.end_date = 'Elige el día que vuelves.'
  else if (v.start_date && v.end_date < v.start_date) e.end_date = 'La vuelta no puede ser antes de la salida.'
  if (v.budget_total && !(Number(v.budget_total) > 0)) e.budget_total = 'Escribe un importe mayor que cero, o déjalo vacío.'
  if (!only) return e
  return Object.fromEntries(Object.entries(e).filter(([k]) => only.includes(k as keyof Values)))
}

/** Sube la portada al bucket `trip-covers` y devuelve su URL pública. */
function useCoverUpload(onDone: (url: string) => void) {
  const { user } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen pesa más de 5 MB. Elige una más ligera.')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
      const { error } = await Promise.race([
        supabase.storage.from('trip-covers').upload(path, file, { upsert: true }),
        timeout,
      ])
      if (error) throw error
      onDone(supabase.storage.from('trip-covers').getPublicUrl(path).data.publicUrl)
    } catch (err) {
      console.error('[TripFormPanel] upload error:', err)
      toast.error(err instanceof Error && err.message === 'timeout'
        ? 'La subida ha tardado demasiado. Comprueba tu conexión.'
        : 'No se ha podido subir la imagen.')
    } finally {
      setUploading(false)
    }
  }
  return { upload, uploading }
}

function CoverField({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { upload, uploading } = useCoverUpload(onChange)
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">Foto de portada <span className="font-normal text-muted-foreground">(opcional)</span></span>
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative grid h-40 w-full place-items-center overflow-hidden rounded-xl border border-dashed border-border-strong bg-sunken text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          {url
            ? <img src={url} alt="Portada elegida" className="size-full object-cover" />
            : (
              <span className="flex flex-col items-center gap-2 text-sm">
                {uploading ? <Spinner label="Subiendo" /> : <ImagePlus className="size-6" aria-hidden="true" />}
                {uploading ? 'Subiendo…' : 'Elegir una foto'}
              </span>
            )}
        </button>
        {url && (
          <IconButton label="Quitar foto" variant="photo" size="sm" className="absolute right-2 top-2" onClick={() => onChange(null)}>
            <X />
          </IconButton>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Si no eliges ninguna, pondremos una bonita por ti.</p>
      <input
        ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }}
      />
    </div>
  )
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/,$/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setDraft('')
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor="trip-tags" className="block text-sm font-medium">
        Etiquetas <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        {tags.map(tag => (
          <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft pl-3 pr-1 text-sm font-medium text-accent-foreground">
            {tag}
            <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(tags.filter(x => x !== tag))} className="grid size-5 place-items-center rounded-full hover:bg-card/60">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id="trip-tags"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={tags.length ? '' : 'playa, amigos, verano…'}
          className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-[0.9375rem] outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <p className="text-xs text-muted-foreground">Pulsa Intro o coma para añadir cada una. Sirven para encontrar el viaje.</p>
    </div>
  )
}

function nights(v: Values): number | null {
  if (!v.start_date || !v.end_date || v.end_date < v.start_date) return null
  return differenceInCalendarDays(parseISO(v.end_date), parseISO(v.start_date))
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-5 flex items-center gap-1.5" aria-label={`Paso ${step + 1} de 3`}>
      {[0, 1, 2].map(i => (
        <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i <= step ? 'bg-primary' : 'bg-secondary')} />
      ))}
    </div>
  )
}

/**
 * Crear o editar un viaje. Lo abre `useUiStore().openTripForm(tripId?)` desde
 * cualquier sitio; se monta una vez en el armazón.
 *
 * Crear: tres pasos cortos (a dónde · cuándo · detalles opcionales).
 * Editar: todo en una hoja.
 */
export default function TripFormPanel() {
  const form = useUiStore(s => s.tripForm)
  const close = useUiStore(s => s.closeTripForm)
  const tripId = form?.tripId
  const { data: trip } = useTrip(tripId ?? '')
  const { profile } = useAuthStore()
  const createTrip = useCreateTrip()
  const updateTrip = useUpdateTrip()

  const editing = !!tripId
  const [v, setV] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [step, setStep] = useState(0)
  // El nombre se propone a partir del destino hasta que la persona lo toca.
  const [nameTouched, setNameTouched] = useState(false)
  // Cambio de fechas pendiente de decidir: qué hacer con las actividades ya
  // planificadas (moverlas con el viaje o dejarlas donde están).
  const [dateShift, setDateShift] = useState<{ days: number; activities: number } | null>(null)
  const [checking, setChecking] = useState(false)

  const open = !!form
  // Se rellena al abrir (o al llegar el viaje que se edita), no en cada render.
  const seedKey = open ? `${tripId ?? 'nuevo'}:${trip?.id ?? ''}` : null
  const [seeded, setSeeded] = useState<string | null>(null)
  if (seedKey !== seeded) {
    setSeeded(seedKey)
    if (seedKey) {
      setErrors({}); setStep(0); setDateShift(null); setNameTouched(false)
      setV(editing && trip ? fromTrip(trip) : EMPTY)
    }
  }

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV(prev => ({ ...prev, [k]: value }))
    setErrors(prev => ({ ...prev, [k]: undefined }))
  }

  const pending = createTrip.isPending || updateTrip.isPending || checking
  const currency = currencySymbol(trip?.default_currency ?? profile?.default_currency ?? undefined)
  const n = nights(v)

  async function save(shiftItinerary: boolean) {
    const payload = {
      name: v.name.trim(),
      destination: v.destination.trim(),
      description: v.description.trim() || null,
      start_date: v.start_date,
      end_date: v.end_date,
      status: v.status,
      budget_total: v.budget_total ? Number(v.budget_total) : null,
      tags: v.tags,
      cover_image_url: v.cover_image_url,
    }
    try {
      if (editing && tripId) await updateTrip.mutateAsync({ id: tripId, ...payload, shiftItinerary })
      else await createTrip.mutateAsync(payload)
    } catch {
      // Del error ya avisa la mutación; el formulario se queda abierto para no perder lo escrito.
      return
    }
    close()
  }

  // Mover el inicio del viaje arrastra el itinerario entero, así que cuando hay
  // actividades planificadas no se decide por la persona: se le pregunta.
  async function submit() {
    const e = validate(v)
    setErrors(e)
    if (Object.keys(e).length) {
      if (!editing) setStep(e.destination || e.name ? 0 : e.start_date || e.end_date ? 1 : 2)
      return
    }
    if (editing && trip && v.start_date !== trip.start_date) {
      const days = differenceInCalendarDays(parseISO(v.start_date), parseISO(trip.start_date))
      setChecking(true)
      const { count } = await supabase
        .from('activities').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id)
      setChecking(false)
      if (days !== 0 && (count ?? 0) > 0) {
        setDateShift({ days, activities: count ?? 0 })
        return
      }
    }
    await save(true)
  }

  function next() {
    const e = validate(v, step === 0 ? ['destination', 'name'] : ['start_date', 'end_date'])
    setErrors(e)
    if (!Object.keys(e).length) setStep(s => s + 1)
  }

  const whereFields = (
    <>
      <Field label="¿A dónde vas?" error={errors.destination}>
        <Input
          value={v.destination}
          autoFocus={!editing}
          placeholder="Lisboa, Portugal"
          onChange={e => {
            set('destination', e.target.value)
            if (!editing && !nameTouched) set('name', e.target.value.split(',')[0].trim())
          }}
        />
      </Field>
      <Field label="Nombre del viaje" hint="Como quieras llamarlo: «Lisboa con amigos», «Luna de miel»…" error={errors.name}>
        <Input value={v.name} placeholder="Lisboa" onChange={e => { setNameTouched(true); set('name', e.target.value) }} />
      </Field>
    </>
  )

  const whenFields = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Salida" error={errors.start_date}>
          <Input
            type="date" value={v.start_date}
            onChange={e => {
              set('start_date', e.target.value)
              // Si la vuelta queda antes de la nueva salida, se arrastra con ella.
              if (v.end_date && e.target.value && v.end_date < e.target.value) set('end_date', e.target.value)
            }}
          />
        </Field>
        <Field label="Vuelta" error={errors.end_date}>
          <Input type="date" value={v.end_date} min={v.start_date || undefined} onChange={e => set('end_date', e.target.value)} />
        </Field>
      </div>
      {n !== null && (
        <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm font-medium text-accent-foreground">
          <CalendarDays className="size-4" aria-hidden="true" />
          {n === 0 ? 'Ida y vuelta en el día' : `${n + 1} días · ${n} ${n === 1 ? 'noche' : 'noches'}`}
        </p>
      )}
    </>
  )

  const detailFields = (
    <>
      <CoverField url={v.cover_image_url} onChange={url => set('cover_image_url', url)} />
      <Field label={`Presupuesto total (${currency})`} optional hint="Te avisaremos de cuánto llevas gastado." error={errors.budget_total}>
        <Input type="number" inputMode="decimal" step="0.01" min="0" value={v.budget_total} placeholder="0,00" onChange={e => set('budget_total', e.target.value)} />
      </Field>
      <Field label="Descripción" optional>
        <Textarea value={v.description} rows={2} placeholder="Algo que quieras recordar de este viaje…" onChange={e => set('description', e.target.value)} />
      </Field>
      <TagsField tags={v.tags} onChange={t => set('tags', t)} />
    </>
  )

  // Paso intermedio: qué hacer con las actividades al mover las fechas.
  if (dateShift) {
    const abs = Math.abs(dateShift.days)
    return (
      <Panel
        open={open} onOpenChange={o => { if (!o) close() }}
        title="¿Movemos también las actividades?"
        onBack={() => setDateShift(null)}
      >
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          El viaje se {dateShift.days > 0 ? 'retrasa' : 'adelanta'} {abs} {abs === 1 ? 'día' : 'días'} y tienes{' '}
          {dateShift.activities} {dateShift.activities === 1 ? 'actividad planificada' : 'actividades planificadas'}.
        </p>
        <div className="mt-5 space-y-3">
          <Card interactive asChild>
            <button type="button" disabled={pending} onClick={() => save(true)}>
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="title-card block">Sí, moverlas con el viaje</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">Se conserva el orden y el reparto por días. Es lo habitual.</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
              </span>
            </button>
          </Card>
          <Card interactive asChild>
            <button type="button" disabled={pending} onClick={() => save(false)}>
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="title-card block">No, dejarlas en sus fechas</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">Se quedan donde están. Las que caigan fuera del viaje se conservan igual.</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </span>
            </button>
          </Card>
        </div>
        {pending && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Guardando…</p>}
      </Panel>
    )
  }

  if (editing) {
    return (
      <Panel
        open={open} onOpenChange={o => { if (!o) close() }}
        title="Editar viaje"
        footer={<>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={pending} onClick={submit}>Guardar cambios</Button>
        </>}
      >
        <form className="space-y-5" onSubmit={e => { e.preventDefault(); void submit() }}>
          {whereFields}
          {whenFields}
          <Field label="Estado" hint="«En curso» y «Completado» se ponen solos según las fechas.">
            <Select value={v.status} onChange={e => set('status', e.target.value as Trip['status'])}>
              {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </Field>
          {detailFields}
          <button type="submit" className="hidden" />
        </form>
      </Panel>
    )
  }

  const titles = ['¿A dónde vas?', '¿Cuándo?', 'Últimos detalles']
  const descriptions = [
    'Empieza por lo básico. Todo se puede cambiar después.',
    v.destination ? `Las fechas de tu viaje a ${v.destination.split(',')[0]}.` : 'Las fechas del viaje.',
    'Nada de esto es obligatorio: puedes crearlo ya.',
  ]
  return (
    <Panel
      open={open} onOpenChange={o => { if (!o) close() }}
      title={titles[step]}
      description={descriptions[step]}
      onBack={step > 0 ? () => setStep(s => s - 1) : undefined}
      footer={step < 2
        ? <Button variant="primary" onClick={next}>Siguiente <ArrowRight /></Button>
        : <Button variant="primary" loading={pending} onClick={submit}>Crear viaje</Button>}
    >
      <StepDots step={step} />
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); if (step < 2) next(); else void submit() }}>
        {step === 0 && (
          <>
            <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-accent-foreground">
              <MapPin className="size-6" aria-hidden="true" />
            </span>
            {whereFields}
          </>
        )}
        {step === 1 && whenFields}
        {step === 2 && detailFields}
        <button type="submit" className="hidden" />
      </form>
    </Panel>
  )
}
