import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Plus, FileText, Trash2, Pencil, ExternalLink, File, Loader2, Upload, Calendar,
  MapPin, IdCard, AlertTriangle, UserPlus, User, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDocuments, useCreateDocument, useUpdateDocument, useDeleteDocument, uploadDocumentFile } from '@/lib/queries/documents'
import { useTravelers, useCreateTraveler, useDeleteTraveler } from '@/lib/queries/travelers'
import { useTripAttachments, useDeleteAttachment } from '@/lib/queries/attachments'
import { useActivities } from '@/lib/queries/itinerary'
import { TripHeader } from '@/components/trips/TripHeader'
import { IdPhotoInput } from '@/components/documents/IdPhotoInput'
import { IdCardViewer } from '@/components/documents/IdCardViewer'
import { DocLightbox } from '@/components/documents/DocLightbox'
import { useAuthStore } from '@/store/authStore'
import { formatDate, DOCUMENT_LABELS, PERSONAL_DOC_CATEGORIES } from '@/lib/utils'
import type { Document, ActivityAttachment, Traveler } from '@/types/database'
import { parseISO, addMonths } from 'date-fns'
import { toast } from 'sonner'

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio'),
  category: z.enum(['flight','train','bus','hotel','car_rental','transfer','tour','ticket','insurance','other']),
  confirmation_number: z.string().optional(),
  locator: z.string().optional(),
  provider: z.string().optional(),
  link: z.string().url('URL inválida').optional().or(z.literal('')),
  datetime_start: z.string().optional(),
  datetime_end: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  seat: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const CATEGORY_ICONS: Record<string, string> = {
  passport: '🛂', dni: '🪪', visa: '📋', driving_license: '🚘', health_card: '⚕️',
  flight: '✈️', train: '🚆', bus: '🚌', hotel: '🏨',
  car_rental: '🚗', transfer: '🚖', tour: '🎭',
  ticket: '🎟️', insurance: '🛡️', other: '📄',
}

const BOOKING_CATEGORIES = Object.entries(DOCUMENT_LABELS).filter(([k]) => !PERSONAL_DOC_CATEGORIES.includes(k))

// datetime_end actúa como fecha de caducidad en documentación personal.
function expiryState(end: string | null): 'expired' | 'soon' | null {
  if (!end) return null
  const d = parseISO(end)
  if (d < new Date()) return 'expired'
  if (d < addMonths(new Date(), 6)) return 'soon'
  return null
}

function ExpiryBadge({ end }: { end: string | null }) {
  const e = expiryState(end)
  if (!e) return null
  return (
    <span
      className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium"
      style={e === 'expired'
        ? { background: 'color-mix(in srgb, var(--destructive) 14%, transparent)', color: 'var(--destructive)' }
        : { background: 'rgba(217,119,6,0.14)', color: '#b45309' }}
    >
      <AlertTriangle size={10} />
      {e === 'expired' ? 'Caducado' : 'Caduca pronto'}
    </span>
  )
}

interface PersonalForm {
  open: boolean
  id?: string
  traveler_id: string
  category: string
  number: string
  expiry: string
  front: string | null
  back: string | null
}

export function DocumentsPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { user } = useAuthStore()
  const { data: documents, isLoading } = useDocuments(tripId!)
  const { data: travelers } = useTravelers(tripId!)
  const { data: attachments } = useTripAttachments(tripId!)
  const { data: activities } = useActivities(tripId!)
  const deleteAttachment = useDeleteAttachment(tripId!)
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()
  const deleteDoc = useDeleteDocument()
  const createTraveler = useCreateTraveler()
  const deleteTraveler = useDeleteTraveler()

  const activityById = new Map((activities ?? []).map(a => [a.id, a]))
  const attachmentsByActivity = (attachments ?? []).reduce<Record<string, typeof attachments>>((acc, att) => {
    (acc[att.activity_id] ??= []).push(att)
    return acc
  }, {})

  const personalDocs = (documents ?? []).filter(d => PERSONAL_DOC_CATEGORIES.includes(d.category))
  const bookingDocs = (documents ?? []).filter(d => !PERSONAL_DOC_CATEGORIES.includes(d.category))
  const docsByTraveler = (id: string) => personalDocs.filter(d => d.traveler_id === id)
  const unassignedPersonal = personalDocs.filter(d => !d.traveler_id)

  const groupedBooking = bookingDocs.reduce<Record<string, Document[]>>((acc, doc) => {
    (acc[doc.category] ??= []).push(doc)
    return acc
  }, {})

  // ---- Estado de UI ----
  const [formOpen, setFormOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<Document | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleteAttTarget, setDeleteAttTarget] = useState<ActivityAttachment | null>(null)
  const [deleteTravTarget, setDeleteTravTarget] = useState<Traveler | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  // Viajero nuevo
  const [travelerName, setTravelerName] = useState('')
  const [travelerFormOpen, setTravelerFormOpen] = useState(false)
  // Documento personal
  const [pForm, setPForm] = useState<PersonalForm | null>(null)
  // Visores
  const [viewId, setViewId] = useState<{ front: string | null; back: string | null; title: string; subtitle: string | null } | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { category: 'other' },
  })

  // ---- Reservas/billetes (formulario genérico) ----
  function openCreate() {
    reset({ category: 'other' }); setFileUrl(null); setEditDoc(null); setFormOpen(true)
  }
  function openEdit(doc: Document) {
    reset({
      title: doc.title, category: doc.category as FormValues['category'],
      confirmation_number: doc.confirmation_number ?? '', locator: doc.locator ?? '',
      provider: doc.provider ?? '', link: doc.link ?? '',
      datetime_start: doc.datetime_start ? doc.datetime_start.slice(0, 16) : '',
      datetime_end: doc.datetime_end ? doc.datetime_end.slice(0, 16) : '',
      origin: doc.origin ?? '', destination: doc.destination ?? '',
      seat: doc.seat ?? '', phone: doc.phone ?? '', notes: doc.notes ?? '',
    })
    setFileUrl(doc.file_url); setEditDoc(doc); setFormOpen(true)
  }
  async function handleFileUpload(file: File) {
    if (!user || !tripId) return
    setUploading(true)
    try { setFileUrl(await uploadDocumentFile(file, user.id, tripId)) }
    catch { toast.error('Error al subir el archivo') }
    finally { setUploading(false) }
  }
  async function onSubmit(values: FormValues) {
    const payload: Omit<Document, 'id' | 'created_at'> = {
      trip_id: tripId!, ...values,
      confirmation_number: values.confirmation_number || null,
      locator: values.locator || null, provider: values.provider || null,
      link: values.link || null,
      datetime_start: values.datetime_start || null, datetime_end: values.datetime_end || null,
      origin: values.origin || null, destination: values.destination || null,
      seat: values.seat || null, phone: values.phone || null, notes: values.notes || null,
      file_url: fileUrl, back_url: null, traveler_id: null,
    }
    if (editDoc) await updateDoc.mutateAsync({ id: editDoc.id, ...payload })
    else await createDoc.mutateAsync(payload)
    setFormOpen(false)
  }

  // ---- Documentos personales ----
  function openPersonalCreate(travelerId: string) {
    setPForm({ open: true, traveler_id: travelerId, category: 'dni', number: '', expiry: '', front: null, back: null })
  }
  function openPersonalEdit(doc: Document) {
    setPForm({
      open: true, id: doc.id, traveler_id: doc.traveler_id ?? '', category: doc.category,
      number: doc.confirmation_number ?? '', expiry: doc.datetime_end ? doc.datetime_end.slice(0, 10) : '',
      front: doc.file_url, back: doc.back_url,
    })
  }
  async function submitPersonal() {
    if (!pForm) return
    const payload: Omit<Document, 'id' | 'created_at'> = {
      trip_id: tripId!,
      category: pForm.category as Document['category'],
      title: DOCUMENT_LABELS[pForm.category] ?? 'Documento',
      traveler_id: pForm.traveler_id || null,
      confirmation_number: pForm.number || null,
      datetime_end: pForm.expiry || null,
      file_url: pForm.front, back_url: pForm.back,
      locator: null, provider: null, link: null, datetime_start: null,
      origin: null, destination: null, seat: null, phone: null, notes: null,
    }
    if (pForm.id) await updateDoc.mutateAsync({ id: pForm.id, ...payload })
    else await createDoc.mutateAsync(payload)
    setPForm(null)
  }

  async function addTraveler() {
    const name = travelerName.trim()
    if (!name) return
    await createTraveler.mutateAsync({ trip_id: tripId!, name })
    setTravelerName(''); setTravelerFormOpen(false)
  }

  const cat = watch('category')
  const isTransport = ['flight', 'train', 'bus', 'transfer'].includes(cat)
  const isStay = ['hotel', 'car_rental'].includes(cat)
  const isEvent = ['tour', 'ticket'].includes(cat)
  const isInsurance = cat === 'insurance'
  const isOther = cat === 'other'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Documentos" />
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-medium">Documentos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Identidad de los viajeros, reservas y billetes</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* ============ Documentación personal por viajero ============ */}
          <section>
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IdCard size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-serif text-xl font-medium">Viajeros</h2>
                <span className="text-xs text-muted-foreground hidden sm:inline">DNI, pasaporte y permisos</span>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={() => setTravelerFormOpen(true)}>
                <UserPlus size={14} /> Añadir viajero
              </Button>
            </div>

            {!travelers?.length && !unassignedPersonal.length ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <User size={26} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Añade a los viajeros y guarda su DNI o pasaporte (anverso y reverso).</p>
              </div>
            ) : (
              <div className="space-y-4">
                {travelers?.map(t => {
                  const docs = docsByTraveler(t.id)
                  const hasId = docs.some(d => d.category === 'dni' || d.category === 'passport')
                  return (
                    <div key={t.id} className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
                            <User size={15} />
                          </span>
                          <p className="font-medium truncate">{t.name}</p>
                          {!hasId && (
                            <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }}>
                              <AlertTriangle size={10} /> Falta DNI/pasaporte
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => openPersonalCreate(t.id)}>
                            <Plus size={13} /> Documento
                          </Button>
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTravTarget(t)} title="Eliminar viajero">
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                      {docs.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {docs.map(doc => (
                            <PersonalDocCard key={doc.id} doc={doc} travelerName={t.name}
                              onView={setViewId} onEdit={openPersonalEdit} onDelete={setDeleteTarget} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Documentos personales sin viajero asignado */}
                {unassignedPersonal.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <p className="font-medium text-sm text-muted-foreground mb-3">Sin viajero asignado</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {unassignedPersonal.map(doc => (
                        <PersonalDocCard key={doc.id} doc={doc} travelerName={null}
                          onView={setViewId} onEdit={openPersonalEdit} onDelete={setDeleteTarget} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <Separator />

          {/* ============ Reservas y billetes ============ */}
          <section>
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-serif text-xl font-medium">Reservas y billetes</h2>
              </div>
              <Button size="sm" className="gap-1.5 flex-shrink-0" onClick={openCreate}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
                <Plus size={14} /> Añadir
              </Button>
            </div>

            {!bookingDocs.length ? (
              <div className="rounded-xl p-6 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <FileText size={26} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Guarda vuelos, hoteles, entradas y confirmaciones.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedBooking).map(([c, docs]) => (
                  <div key={c}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{CATEGORY_ICONS[c]}</span>
                      <h3 className="font-serif text-lg font-medium">{DOCUMENT_LABELS[c]}</h3>
                      <Badge variant="outline" className="text-xs">{docs.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {docs.map((doc, i) => (
                        <DocRow key={doc.id} doc={doc} i={i} onEdit={openEdit} onDelete={setDeleteTarget}
                          onOpenFile={(url, name) => setLightbox({ url, name })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============ Del itinerario (adjuntos de actividades) ============ */}
          {Object.keys(attachmentsByActivity).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-serif text-xl font-medium">Del itinerario</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Entradas, QRs y documentos adjuntos a actividades</p>
              <div className="space-y-4">
                {Object.entries(attachmentsByActivity).map(([activityId, atts]) => {
                  const act = activityById.get(activityId)
                  return (
                    <div key={activityId} className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-1.5 mb-3">
                        <MapPin size={13} style={{ color: 'var(--primary)' }} />
                        <p className="font-medium text-sm">{act?.title ?? 'Actividad'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {atts?.map(att => {
                          const isImg = att.mime?.startsWith('image/') ?? /\.(png|jpe?g|webp)$/i.test(att.file_url)
                          return (
                            <div key={att.id} className="flex items-center gap-2 rounded-lg border border-border pr-1" style={{ background: 'var(--secondary)' }}>
                              <button type="button" onClick={() => setLightbox({ url: att.file_url, name: att.name })}
                                className="flex items-center gap-2 pl-1.5 py-1.5 min-w-0" title={att.name}>
                                {isImg ? (
                                  <img src={att.file_url} alt={att.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                                ) : (
                                  <span className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--card)' }}>
                                    <File size={14} style={{ color: 'var(--primary)' }} />
                                  </span>
                                )}
                                <span className="text-xs truncate max-w-[160px]">{att.name}</span>
                              </button>
                              <button type="button" onClick={() => setDeleteAttTarget(att)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive flex-shrink-0" title="Eliminar adjunto">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---- Visores ---- */}
      <IdCardViewer
        open={!!viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        title={viewId?.title ?? ''}
        subtitle={viewId?.subtitle}
        front={viewId?.front ?? null}
        back={viewId?.back ?? null}
      />
      <DocLightbox
        open={!!lightbox}
        onOpenChange={(o) => !o && setLightbox(null)}
        url={lightbox?.url ?? null}
        name={lightbox?.name ?? ''}
      />

      {/* ---- Nuevo viajero ---- */}
      <Dialog open={travelerFormOpen} onOpenChange={setTravelerFormOpen}>
        <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader><DialogTitle className="font-serif">Añadir viajero</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nombre</Label>
            <Input value={travelerName} onChange={(e) => setTravelerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTraveler()} placeholder="Nombre del viajero" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setTravelerFormOpen(false)}>Cancelar</Button>
            <Button disabled={!travelerName.trim() || createTraveler.isPending} onClick={addTraveler}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Documento personal (DNI/pasaporte…) ---- */}
      <Dialog open={!!pForm} onOpenChange={(o) => !o && setPForm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{pForm?.id ? 'Editar documento' : 'Documento de identidad'}</DialogTitle>
          </DialogHeader>
          {pForm && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={pForm.category} onValueChange={(v) => setPForm({ ...pForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERSONAL_DOC_CATEGORIES.map(k => (
                        <SelectItem key={k} value={k}>{CATEGORY_ICONS[k]} {DOCUMENT_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Viajero</Label>
                  <Select value={pForm.traveler_id || 'none'} onValueChange={(v) => setPForm({ ...pForm, traveler_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {travelers?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nº de documento</Label>
                  <Input value={pForm.number} onChange={(e) => setPForm({ ...pForm, number: e.target.value })} placeholder="XX0000000" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Caducidad</Label>
                  <Input type="date" value={pForm.expiry} onChange={(e) => setPForm({ ...pForm, expiry: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <IdPhotoInput label="Anverso" value={pForm.front} tripId={tripId!} onChange={(url) => setPForm({ ...pForm, front: url })} />
                <IdPhotoInput label="Reverso" value={pForm.back} tripId={tripId!} onChange={(url) => setPForm({ ...pForm, back: url })} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPForm(null)}>Cancelar</Button>
            <Button disabled={createDoc.isPending || updateDoc.isPending} onClick={submitPersonal}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
              {(createDoc.isPending || updateDoc.isPending) && <Loader2 size={14} className="animate-spin mr-2" />}
              {pForm?.id ? 'Guardar' : 'Añadir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Form reservas/billetes ---- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editDoc ? 'Editar reserva' : 'Nueva reserva / billete'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={watch('category')} onValueChange={(v) => setValue('category', v as FormValues['category'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOOKING_CATEGORIES.map(([k, v]) => (
                    <SelectItem key={k} value={k}>{CATEGORY_ICONS[k]} {v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input {...register('title')} placeholder="Ej: Vuelo Madrid → París" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isInsurance ? 'Aseguradora' : 'Proveedor'}</Label>
                <Input {...register('provider')} placeholder={isInsurance ? 'Mapfre…' : isStay ? 'Booking, Hertz…' : 'Iberia, Renfe…'} />
              </div>
              <div className="space-y-1.5">
                <Label>{isInsurance ? 'Nº de póliza' : 'Nº confirmación'}</Label>
                <Input {...register('confirmation_number')} placeholder="000000000" />
              </div>
            </div>
            {(isTransport || isOther) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Localizador</Label>
                  <Input {...register('locator')} placeholder="ABC123" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Asiento</Label>
                  <Input {...register('seat')} placeholder="14A" />
                </div>
              </div>
            )}
            {(isTransport || isOther) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Origen</Label>
                  <Input {...register('origin')} placeholder="Madrid" />
                </div>
                <div className="space-y-1.5">
                  <Label>Destino</Label>
                  <Input {...register('destination')} placeholder="París" />
                </div>
              </div>
            )}
            {isEvent ? (
              <div className="space-y-1.5">
                <Label>Fecha y hora</Label>
                <Input type="datetime-local" {...register('datetime_start')} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isStay ? (cat === 'hotel' ? 'Entrada' : 'Recogida') : isInsurance ? 'Inicio cobertura' : 'Fecha/hora inicio'}</Label>
                  <Input type="datetime-local" {...register('datetime_start')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isStay ? (cat === 'hotel' ? 'Salida' : 'Devolución') : isInsurance ? 'Fin cobertura' : 'Fecha/hora fin'}</Label>
                  <Input type="datetime-local" {...register('datetime_end')} />
                </div>
              </div>
            )}
            {(isStay || isInsurance || isOther) && (
              <div className="space-y-1.5">
                <Label>{isInsurance ? 'Teléfono de asistencia' : 'Teléfono'}</Label>
                <Input {...register('phone')} placeholder="+34..." />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Enlace de la reserva (eDreams, Booking…)</Label>
              <Input {...register('link')} placeholder="https://www.edreams.es/..." />
              {errors.link && <p className="text-xs text-destructive">{errors.link.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Adjunto (PDF o imagen)</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById('doc-file-input')?.click()}>
                {uploading ? <Loader2 size={16} className="animate-spin" /> : fileUrl ? <File size={16} style={{ color: 'var(--primary)' }} /> : <Upload size={16} className="text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{uploading ? 'Subiendo...' : fileUrl ? 'Archivo subido ✓' : 'Subir archivo'}</span>
              </div>
              <input id="doc-file-input" type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea {...register('notes')} rows={2} placeholder="Notas adicionales..." />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || uploading}
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
                {editDoc ? 'Guardar' : 'Añadir'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- Confirmaciones de borrado ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteTarget?.title}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteDoc.mutate({ id: deleteTarget.id, tripId: tripId! }); setDeleteTarget(null) }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTravTarget} onOpenChange={() => setDeleteTravTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar viajero?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteTravTarget?.name}</strong>. Sus documentos quedarán sin asignar (no se borran).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteTravTarget) deleteTraveler.mutate({ id: deleteTravTarget.id, tripId: tripId! }); setDeleteTravTarget(null) }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAttTarget} onOpenChange={() => setDeleteAttTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar adjunto?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteAttTarget?.name}</strong> del itinerario.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteAttTarget) deleteAttachment.mutate(deleteAttTarget.id); setDeleteAttTarget(null) }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Tarjeta de documento de identidad (con miniatura del anverso → abre el visor).
function PersonalDocCard({ doc, travelerName, onView, onEdit, onDelete }: {
  doc: Document
  travelerName: string | null
  onView: (v: { front: string | null; back: string | null; title: string; subtitle: string | null }) => void
  onEdit: (d: Document) => void
  onDelete: (d: Document) => void
}) {
  const subtitle = [travelerName, doc.confirmation_number].filter(Boolean).join(' · ') || null
  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ background: 'var(--secondary)' }}>
      <button type="button" className="w-full flex items-stretch gap-3 text-left"
        onClick={() => onView({ front: doc.file_url, back: doc.back_url, title: `${DOCUMENT_LABELS[doc.category]}${travelerName ? ` · ${travelerName}` : ''}`, subtitle: doc.confirmation_number })}>
        <div className="w-16 flex-shrink-0 bg-black/5 flex items-center justify-center">
          {doc.file_url
            ? <img src={doc.file_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-2xl py-3">{CATEGORY_ICONS[doc.category]}</span>}
        </div>
        <div className="flex-1 min-w-0 py-2 pr-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-medium text-sm">{DOCUMENT_LABELS[doc.category]}</p>
            <ExpiryBadge end={doc.datetime_end} />
          </div>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1 mt-0.5">
            <Eye size={10} /> Ver {doc.back_url ? '· anverso y reverso' : ''}
          </span>
        </div>
      </button>
      <div className="flex border-t border-border/60">
        <button type="button" onClick={() => onEdit(doc)} className="flex-1 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
          <Pencil size={11} /> Editar
        </button>
        <button type="button" onClick={() => onDelete(doc)} className="flex-1 py-1.5 text-xs text-destructive/80 hover:text-destructive flex items-center justify-center gap-1 border-l border-border/60">
          <Trash2 size={11} /> Eliminar
        </button>
      </div>
    </div>
  )
}

function DocRow({ doc, i, onEdit, onDelete, onOpenFile }: {
  doc: Document
  i: number
  onEdit: (d: Document) => void
  onDelete: (d: Document) => void
  onOpenFile: (url: string, name: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.05 }}
      className="group flex items-start gap-4 p-4 rounded-xl"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <span className="text-2xl flex-shrink-0">{CATEGORY_ICONS[doc.category]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{doc.title}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {doc.provider && <span className="text-xs text-muted-foreground">{doc.provider}</span>}
              {doc.locator && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
                  {doc.locator}
                </span>
              )}
              {doc.confirmation_number && <span className="text-xs text-muted-foreground">#{doc.confirmation_number}</span>}
            </div>
            {(doc.origin || doc.destination) && (
              <p className="text-xs text-muted-foreground mt-1">
                {doc.origin}{doc.origin && doc.destination ? ' → ' : ''}{doc.destination}
                {doc.seat && <span className="ml-2">Asiento: {doc.seat}</span>}
              </p>
            )}
            {doc.datetime_start && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(doc.datetime_start, 'dd MMM yyyy · HH:mm')}
                {doc.datetime_end && ` — ${formatDate(doc.datetime_end, 'dd MMM yyyy · HH:mm')}`}
              </p>
            )}
          </div>
          <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {doc.file_url && (
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => onOpenFile(doc.file_url!, doc.title)} title="Ver archivo">
                <Eye size={13} />
              </Button>
            )}
            {doc.link && (
              <Button size="icon" variant="ghost" className="w-7 h-7" asChild>
                <a href={doc.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>
              </Button>
            )}
            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => onEdit(doc)}>
              <Pencil size={12} />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => onDelete(doc)}>
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
