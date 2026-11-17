import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Card, Field, Input, Notice, Panel, Skeleton } from '@/design'
import { useDeleteUserPreview, useDeleteUser } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'

// Borrar una cuenta es irreversible y toca a terceros. El panel enseña ANTES
// lo que va a pasar —incluido a quién más afecta— y exige escribir el correo
// completo. Un «¿seguro?» no es una confirmación: es un trámite que se pulsa
// sin leer. Por eso es un <Panel> con campo y no un <Confirm>.
export function DeleteUserDialog({ userId, abierto, onClose }: {
  userId: string
  abierto: boolean
  onClose: () => void
}) {
  const { data: prev, isLoading } = useDeleteUserPreview(userId, abierto)
  const borrar = useDeleteUser()
  const [texto, setTexto] = useState('')

  const email = prev?.email ?? ''
  const coincide = texto.trim().toLowerCase() === email.toLowerCase() && !!email

  function cerrar() {
    if (borrar.isPending) return
    setTexto('')
    onClose()
  }

  function confirmar() {
    borrar.mutate({ userId, confirmEmail: texto.trim() }, { onSuccess: onClose })
  }

  const s = (n: number) => (n === 1 ? '' : 's')

  return (
    <Panel
      open={abierto}
      onOpenChange={o => { if (!o) cerrar() }}
      title="Borrar esta cuenta"
      description="No se puede deshacer."
      footer={
        <>
          <Button variant="ghost" onClick={cerrar} disabled={borrar.isPending}>Cancelar</Button>
          <Button variant="danger" disabled={!coincide} loading={borrar.isPending} onClick={confirmar}>
            Borrar para siempre
          </Button>
        </>
      }
    >
      {isLoading || !prev ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <p className="text-[0.9375rem]">
            Vas a borrar <strong className="break-all">{email}</strong> y todo lo suyo.
          </p>

          <Card sunken pad="sm">
            <ul className="space-y-1.5 text-sm">
              <li>{prev.viajes_propios.length} viaje{s(prev.viajes_propios.length)} suyo{s(prev.viajes_propios.length)}, con todo su contenido</li>
              <li>{prev.ficheros} fichero{s(prev.ficheros)} · {formatBytes(prev.bytes)}</li>
              <li>
                {prev.visitas} visitas y {prev.eventos} acciones{' '}
                <span className="text-muted-foreground">— se anonimizan, no se borran</span>
              </li>
            </ul>
          </Card>

          {prev.colaboradores_afectados.length > 0 && (
            <Notice tone="danger" icon={AlertTriangle} title="Esto afecta a otras personas">
              Perderán el acceso a sus viajes: {prev.colaboradores_afectados.join(', ')}.
            </Notice>
          )}

          {prev.viajes_ajenos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Participa en {prev.viajes_ajenos.length} viaje{s(prev.viajes_ajenos.length)} de otras
              personas. Esos viajes NO se borran, pero las fotos y portadas que subió allí sí,
              porque son ficheros suyos: alguna actividad se quedará sin imagen.
            </p>
          )}

          {prev.invitaciones_a_reasignar > 0 && (
            <p className="text-sm text-muted-foreground">
              {prev.invitaciones_a_reasignar} invitación
              {prev.invitaciones_a_reasignar === 1 ? '' : 'es'} que hizo en viajes ajenos
              pasarán a nombre del dueño del viaje, para que esas personas no se queden fuera.
            </p>
          )}

          <Field label={<>Escribe <strong className="break-all">{email}</strong> para confirmar</>}>
            <Input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={email}
            />
          </Field>
        </div>
      )}
    </Panel>
  )
}
