import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Plus, FileText, Trash2, Pencil, ExternalLink, File, Loader2, Upload, Calendar, MapPin } from 'lucide-react'
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
import { useTripAttachments, useDeleteAttachment } from '@/lib/queries/attachments'
import { useActivities } from '@/lib/queries/itinerary'
import { TripHeader } from '@/components/trips/TripHeader'
import { useAuthStore } from '@/store/authStore'
import { formatDate, DOCUMENT_LABELS } from '@/lib/utils'
import type { Document, ActivityAttachment } from '@/types/database'
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
  flight: '✈️', train: '🚆', bus: '🚌', hotel: '🏨',
  car_rental: '🚗', transfer: '🚖', tour: '🎭',
  ticket: '🎟️', insurance: '🛡️', other: '📄',
}

export function DocumentsPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { user } = useAuthStore()
  const { data: documents, isLoading } = useDocuments(tripId!)
  const { data: attachments } = useTripAttachments(tripId!)
  const { data: activities } = useActivities(tripId!)
  const deleteAttachment = useDeleteAttachment(tripId!)
  const createDoc = useCreateDocument()
  const updateDoc = useUpdateDocument()
  const deleteDoc = useDeleteDocument()

  // Agrupa los adjuntos del itinerario por actividad.
  const activityById = new Map((activities ?? []).map(a => [a.id, a]))
  const attachmentsByActivity = (attachments ?? []).reduce<Record<string, typeof attachments>>((acc, att) => {
    (acc[att.activity_id] ??= []).push(att)
    return acc
  }, {})

  const [formOpen, setFormOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<Document | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleteAttTarget, setDeleteAttTarget] = useState<ActivityAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { category: 'other' },
  })

  function openCreate() {
    reset({ category: 'other' })
    setFileUrl(null)
    setEditDoc(null)
    setFormOpen(true)
  }

  function openEdit(doc: Document) {
    reset({
      title: doc.title,
      category: doc.category,
      confirmation_number: doc.confirmation_number ?? '',
      locator: doc.locator ?? '',
      provider: doc.provider ?? '',
      link: doc.link ?? '',
      datetime_start: doc.datetime_start ? doc.datetime_start.slice(0, 16) : '',
      datetime_end: doc.datetime_end ? doc.datetime_end.slice(0, 16) : '',
      origin: doc.origin ?? '',
      destination: doc.destination ?? '',
      seat: doc.seat ?? '',
      phone: doc.phone ?? '',
      notes: doc.notes ?? '',
    })
    setFileUrl(doc.file_url)
    setEditDoc(doc)
    setFormOpen(true)
  }

  async function handleFileUpload(file: File) {
    if (!user || !tripId) return
    setUploading(true)
    try {
      const url = await uploadDocumentFile(file, user.id, tripId)
      setFileUrl(url)
    } catch {
      toast.error('Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(values: FormValues) {
    const payload: Omit<Document, 'id' | 'created_at'> = {
      trip_id: tripId!,
      ...values,
      confirmation_number: values.confirmation_number || null,
      locator: values.locator || null,
      provider: values.provider || null,
      link: values.link || null,
      datetime_start: values.datetime_start || null,
      datetime_end: values.datetime_end || null,
      origin: values.origin || null,
      destination: values.destination || null,
      seat: values.seat || null,
      phone: values.phone || null,
      notes: values.notes || null,
      file_url: fileUrl,
    }
    if (editDoc) {
      await updateDoc.mutateAsync({ id: editDoc.id, ...payload })
    } else {
      await createDoc.mutateAsync(payload)
    }
    setFormOpen(false)
  }

  // Agrupar por categoría
  const grouped = documents?.reduce<Record<string, Document[]>>((acc, doc) => {
    acc[doc.category] = [...(acc[doc.category] ?? []), doc]
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <TripHeader tripId={tripId!} section="Documentos" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl font-medium">Documentos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Reservas, billetes y confirmaciones</p>
        </div>
        <Button
          onClick={openCreate}
          style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
          className="gap-2"
        >
          <Plus size={16} />
          Añadir
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !documents?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText size={48} className="mb-4 text-muted-foreground" />
          <h3 className="font-serif text-2xl mb-2">Sin documentos</h3>
          <p className="text-muted-foreground text-sm">
            Guarda billetes, reservas de hotel, entradas y más.
          </p>
          <Button onClick={openCreate} className="mt-6 gap-2"
            style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={16} />
            Añadir documento
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <FileText size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl font-medium">Del viaje</h2>
            <span className="text-xs text-muted-foreground">DNI, reservas y confirmaciones</span>
          </div>
          {Object.entries(grouped ?? {}).map(([cat, docs]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                <h2 className="font-serif text-lg font-medium">{DOCUMENT_LABELS[cat]}</h2>
                <Badge variant="outline" className="text-xs">{docs.length}</Badge>
              </div>
              <div className="space-y-2">
                {docs.map((doc, i) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="group flex items-start gap-4 p-4 rounded-xl"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-2xl flex-shrink-0">{CATEGORY_ICONS[doc.category]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            {doc.provider && (
                              <span className="text-xs text-muted-foreground">{doc.provider}</span>
                            )}
                            {doc.locator && (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                                style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
                                {doc.locator}
                              </span>
                            )}
                            {doc.confirmation_number && (
                              <span className="text-xs text-muted-foreground">#{doc.confirmation_number}</span>
                            )}
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
                        <div className="flex gap-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">
                          {doc.file_url && (
                            <Button size="icon" variant="ghost" className="w-7 h-7" asChild>
                              <a href={doc.file_url} target="_blank" rel="noreferrer"><File size={12} /></a>
                            </Button>
                          )}
                          {doc.link && (
                            <Button size="icon" variant="ghost" className="w-7 h-7" asChild>
                              <a href={doc.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(doc)}>
                            <Pencil size={12} />
                          </Button>
                          <Button size="icon" variant="ghost"
                            className="w-7 h-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(doc)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documentos del itinerario (adjuntos de actividades) */}
      {Object.keys(attachmentsByActivity).length > 0 && (
        <div className="mt-10">
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
                        <div
                          key={att.id}
                          className="flex items-center gap-2 rounded-lg border border-border pr-1"
                          style={{ background: 'var(--secondary)' }}
                        >
                          <a href={att.file_url} target="_blank" rel="noreferrer" title={att.name}
                            className="flex items-center gap-2 pl-1.5 py-1.5 min-w-0">
                            {isImg ? (
                              <img src={att.file_url} alt={att.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <span className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--card)' }}>
                                <File size={14} style={{ color: 'var(--primary)' }} />
                              </span>
                            )}
                            <span className="text-xs truncate max-w-[160px]">{att.name}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setDeleteAttTarget(att)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive flex-shrink-0"
                            title="Eliminar adjunto"
                          >
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
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editDoc ? 'Editar documento' : 'Nuevo documento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={watch('category')} onValueChange={(v) => setValue('category', v as FormValues['category'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_LABELS).map(([k, v]) => (
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
                <Label>Proveedor</Label>
                <Input {...register('provider')} placeholder="Iberia, Booking..." />
              </div>
              <div className="space-y-1.5">
                <Label>Localizador</Label>
                <Input {...register('locator')} placeholder="ABC123" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nº confirmación</Label>
                <Input {...register('confirmation_number')} placeholder="000000000" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...register('phone')} placeholder="+34..." />
              </div>
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha/hora inicio</Label>
                <Input type="datetime-local" {...register('datetime_start')} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha/hora fin</Label>
                <Input type="datetime-local" {...register('datetime_end')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Asiento</Label>
              <Input {...register('seat')} placeholder="14A" />
            </div>
            <div className="space-y-1.5">
              <Label>Enlace de la reserva (eDreams, Booking…)</Label>
              <Input {...register('link')} placeholder="https://www.edreams.es/..." />
              {errors.link && <p className="text-xs text-destructive">{errors.link.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Adjunto (PDF o imagen)</Label>
              <div
                className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById('doc-file-input')?.click()}
              >
                {uploading
                  ? <Loader2 size={16} className="animate-spin" />
                  : fileUrl
                    ? <File size={16} style={{ color: 'var(--primary)' }} />
                    : <Upload size={16} className="text-muted-foreground" />
                }
                <span className="text-xs text-muted-foreground">
                  {uploading ? 'Subiendo...' : fileUrl ? 'Archivo subido ✓' : 'Subir archivo'}
                </span>
              </div>
              <input
                id="doc-file-input"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{deleteTarget?.title}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteDoc.mutate({ id: deleteTarget.id, tripId: tripId! })
                setDeleteTarget(null)
              }}
            >
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
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteAttTarget) deleteAttachment.mutate(deleteAttTarget.id)
                setDeleteAttTarget(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
