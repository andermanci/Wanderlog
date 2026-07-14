import { useState } from 'react'
import { Mail, Trash2, Loader2, Clock, Check } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCollaborators, useShareTrip, useRemoveCollaborator } from '@/lib/queries/sharing'
import { useTrip } from '@/lib/queries/trips'
import { useAuthStore } from '@/store/authStore'
import type { TripCollaborator } from '@/types/database'

interface ShareTripDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
}

export function ShareTripDialog({ open, onClose, tripId }: ShareTripDialogProps) {
  const { data: collaborators, isLoading } = useCollaborators(tripId)
  const { data: trip } = useTrip(tripId)
  const { user } = useAuthStore()
  const share = useShareTrip(tripId)
  const remove = useRemoveCollaborator(tripId)
  const [email, setEmail] = useState('')

  // Mismas reglas que la RLS: el dueño quita a cualquiera; un colaborador
  // solo las invitaciones que hizo él, y a sí mismo (salir del viaje).
  const isOwner = !!trip && trip.user_id === user?.id
  const canRemove = (c: TripCollaborator) =>
    isOwner || c.invited_by === user?.id || c.user_id === user?.id

  function handleShare(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    share.mutate(value, { onSuccess: () => setEmail('') })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle>Compartir viaje</DialogTitle>
          <DialogDescription>
            Invita a alguien por correo. Podrá ver y editar todo el viaje (itinerario, mapa, documentos, gastos…).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleShare} className="flex gap-2">
          <div className="relative flex-1">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              required
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={share.isPending}>
            {share.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Compartir'}
          </Button>
        </form>

        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Con acceso</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Cargando…</p>
          ) : !collaborators?.length ? (
            <p className="text-sm text-muted-foreground py-2">Aún no has compartido este viaje.</p>
          ) : (
            <ul className="space-y-1.5">
              {collaborators.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'var(--secondary)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{c.email}</span>
                    {c.user_id ? (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}>
                        <Check size={12} /> activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={12} /> pendiente
                      </span>
                    )}
                  </div>
                  {canRemove(c) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate(c.id)}
                      disabled={remove.isPending}
                      aria-label={c.user_id === user?.id ? 'Salir del viaje' : `Quitar acceso a ${c.email}`}
                      title={c.user_id === user?.id ? 'Salir del viaje' : 'Quitar acceso'}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
