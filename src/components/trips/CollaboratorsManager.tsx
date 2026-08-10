import { useState } from 'react'
import { Mail, Trash2, Loader2, Clock, Check, Send, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCollaborators, useShareTrip, useRemoveCollaborator, useSetCollaboratorRole,
  useResendInvite, useTripRole, canShareRole, inviteUrl, ROLE_LABELS,
} from '@/lib/queries/sharing'
import { useTrip } from '@/lib/queries/trips'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import type { TripCollaborator } from '@/types/database'
import { toast } from 'sonner'
import { useMyLimits } from '@/lib/queries/limits'
import { bloqueoParaCompartir } from '@/lib/limits'

// Invitar y gestionar colaboradores con su nivel de permiso.
// Reutilizado por el dialog de compartir y por Ajustes del viaje.
export function CollaboratorsManager({ tripId }: { tripId: string }) {
  const { data: collaborators, isLoading } = useCollaborators(tripId)
  const { data: trip } = useTrip(tripId)
  const { data: myRole } = useTripRole(tripId)
  const { user } = useAuthStore()
  const share = useShareTrip(tripId)
  const remove = useRemoveCollaborator(tripId)
  const setRole = useSetCollaboratorRole(tripId)
  const resend = useResendInvite(tripId)
  const [email, setEmail] = useState('')

  const isOwner = !!trip && trip.user_id === user?.id
  const canInvite = canShareRole(myRole)
  // El permiso del VIAJE (canInvite) y el de la CUENTA son cosas distintas:
  // puedes ser dueño y aun así tener las invitaciones desactivadas. Sin esto,
  // el botón manda la petición y RLS la rechaza con un error crudo.
  const { data: limites } = useMyLimits()
  const bloqueoCuenta = bloqueoParaCompartir(limites)
  // Mismas reglas que la RLS: el dueño quita a cualquiera; un colaborador
  // solo las invitaciones que hizo él, y a sí mismo (salir del viaje).
  const canRemove = (c: TripCollaborator) =>
    isOwner || c.invited_by === user?.id || c.user_id === user?.id

  function handleShare(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    share.mutate(value, { onSuccess: () => setEmail('') })
  }

  // Casi nadie mira el correo: el enlace se manda también por WhatsApp. En
  // móvil se abre el compartir del sistema; en escritorio, al portapapeles.
  async function handleShareLink(c: TripCollaborator) {
    const url = inviteUrl(c.invite_token)
    const text = `Te invito a "${trip?.name ?? 'mi viaje'}" en Wanderlog`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url })
        return
      } catch {
        // cancelado o no permitido: se cae al portapapeles
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace de invitación copiado')
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  return (
    <div className="space-y-3">
      {canInvite && (
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
          <Button type="submit" disabled={share.isPending || !!bloqueoCuenta} title={bloqueoCuenta ?? undefined}>
            {share.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Invitar'}
          </Button>
        </form>
      )}

      {canInvite && bloqueoCuenta && (
        <p className="text-sm text-muted-foreground">{bloqueoCuenta}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Con acceso</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Cargando…</p>
        ) : !collaborators?.length ? (
          <p className="text-sm text-muted-foreground py-2">Todavía no hay nadie más en este viaje.</p>
        ) : (
          <ul className="space-y-1.5">
            {collaborators.map((c) => (
              <li
                key={c.id}
                className="rounded-lg px-3 py-2"
                style={{ background: 'var(--secondary)' }}
              >
                <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm truncate">{c.email}</span>
                  {c.user_id ? (
                    <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'var(--primary)' }}>
                      <Check size={12} /> activo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Clock size={12} /> pendiente
                    </span>
                  )}
                </div>
                {/* Nivel de permiso: solo el dueño lo cambia */}
                {isOwner ? (
                  <Select
                    value={c.role}
                    onValueChange={(v) => setRole.mutate({ id: c.id, role: v as TripCollaborator['role'] })}
                  >
                    <SelectTrigger className="h-7 text-xs w-auto gap-1 flex-shrink-0" aria-label={`Permiso de ${c.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>).map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground flex-shrink-0">{ROLE_LABELS[c.role]}</span>
                )}
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
                </div>

                {/* Mientras no haya entrado, las dos formas de insistir:
                    reenviar el correo o pasarle el enlace por otro sitio. */}
                {!c.user_id && canInvite && (
                  <div className="flex items-center gap-3 pt-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => resend.mutate(c.id)}
                      disabled={resend.isPending && resend.variables === c.id}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {resend.isPending && resend.variables === c.id
                        ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        : <Send size={12} aria-hidden="true" />}
                      Reenviar correo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareLink(c)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Link2 size={12} aria-hidden="true" />
                      Compartir enlace
                    </button>
                    {c.invite_sent_at && (
                      <span className="text-muted-foreground/70 ml-auto hidden sm:inline">
                        Enviado {formatDate(c.invite_sent_at, "d MMM 'a las' HH:mm")}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
