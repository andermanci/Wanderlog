import { useState } from 'react'
import { Check, Clock, Link2, LogOut, Send, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Badge, Button, Card, Empty, Field, Input, Menu, Select, Spinner } from '@/design'
import {
  canShareRole, inviteUrl, ROLE_LABELS, useCollaborators, useRemoveCollaborator, useResendInvite,
  useSetCollaboratorRole, useShareTrip, useTripRole,
} from '@/lib/queries/sharing'
import { useTrip } from '@/lib/queries/trips'
import { useMyLimits } from '@/lib/queries/limits'
import { bloqueoParaCompartir } from '@/lib/limits'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import type { TripCollaborator } from '@/types/database'

/**
 * Invitar a gente al viaje y decidir qué puede hacer cada uno.
 * Se usa en el panel «Compartir» y en Ajustes del viaje.
 */
export function Collaborators({ tripId }: { tripId: string }) {
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
  // puedes ser dueño y tener las invitaciones desactivadas.
  const { data: limites } = useMyLimits()
  const bloqueoCuenta = bloqueoParaCompartir(limites)
  // Mismas reglas que la RLS: el dueño quita a cualquiera; un colaborador solo
  // las invitaciones que hizo él, y a sí mismo (salir del viaje).
  const canRemove = (c: TripCollaborator) => isOwner || c.invited_by === user?.id || c.user_id === user?.id

  function invite(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (value) share.mutate(value, { onSuccess: () => setEmail('') })
  }

  // Casi nadie mira el correo: el enlace se manda también por WhatsApp. En
  // móvil se abre el compartir del sistema; en escritorio, al portapapeles.
  async function shareLink(c: TripCollaborator) {
    const url = inviteUrl(c.invite_token)
    const text = `Te invito a «${trip?.name ?? 'mi viaje'}» en Wanderlog`
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); return } catch { /* cancelado: al portapapeles */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace de invitación copiado')
    } catch {
      toast.error('No se ha podido copiar el enlace')
    }
  }

  return (
    <div className="space-y-6">
      {canInvite && (
        <form onSubmit={invite} className="space-y-2">
          <Field
            label="Invitar por correo"
            hint={bloqueoCuenta ?? 'Le llegará un enlace. Entra pudiendo ver el viaje; luego puedes dejarle editar.'}
          >
            <Input type="email" required value={email} placeholder="correo@ejemplo.com" onChange={e => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" block loading={share.isPending} disabled={!!bloqueoCuenta}>
            <UserPlus /> Enviar invitación
          </Button>
        </form>
      )}

      <div className="space-y-3">
        <h3 className="eyebrow">Quién tiene acceso</h3>
        {isLoading ? (
          <Spinner />
        ) : !collaborators?.length ? (
          <Empty bare icon={UserPlus} title="Solo tú, de momento" description="Invita a quien viaja contigo para que vea el plan, los billetes y los gastos." className="py-6" />
        ) : (
          <ul className="space-y-2.5">
            {collaborators.map(c => {
              const me = c.user_id === user?.id
              return (
                <li key={c.id}>
                  <Card pad="sm" sunken className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.email} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-medium">{c.email}{me && ' (tú)'}</p>
                        {c.user_id
                          ? <Badge tone="success" icon={Check}>Ha entrado</Badge>
                          : <Badge tone="warning" icon={Clock}>Aún no ha entrado</Badge>}
                      </div>
                      {canRemove(c) && (
                        <Menu
                          label={`Opciones de ${c.email}`}
                          items={[
                            !c.user_id && canInvite && { label: 'Reenviar el correo', icon: Send, onSelect: () => resend.mutate(c.id) },
                            !c.user_id && canInvite && { label: 'Pasarle el enlace', icon: Link2, onSelect: () => { void shareLink(c) }, hint: 'Por WhatsApp o como quieras' },
                            me
                              ? { label: 'Salir del viaje', icon: LogOut, danger: true, separated: true, onSelect: () => remove.mutate(c.id) }
                              : { label: 'Quitar acceso', icon: Trash2, danger: true, separated: true, onSelect: () => remove.mutate(c.id) },
                          ]}
                        />
                      )}
                    </div>
                    {/* Qué puede hacer: solo lo cambia quien creó el viaje. */}
                    {isOwner ? (
                      <Select
                        aria-label={`Permiso de ${c.email}`}
                        value={c.role}
                        onChange={e => setRole.mutate({ id: c.id, role: e.target.value as TripCollaborator['role'] })}
                      >
                        {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map(r => (
                          <option key={r} value={r}>Puede: {ROLE_LABELS[r].toLowerCase()}</option>
                        ))}
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">Puede: {ROLE_LABELS[c.role].toLowerCase()}</p>
                    )}
                    {!c.user_id && c.invite_sent_at && (
                      <p className="text-xs text-muted-foreground">Invitación enviada el {formatDate(c.invite_sent_at, "d MMM 'a las' HH:mm")}</p>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
