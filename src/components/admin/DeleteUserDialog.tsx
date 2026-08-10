import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteUserPreview, useDeleteUser } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'

// Borrar una cuenta es irreversible y toca a terceros. El diálogo enseña ANTES
// lo que va a pasar —incluido a quién más afecta— y exige escribir el correo
// completo. Un «¿seguro?» no es una confirmación: es un trámite que se pulsa
// sin leer.
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

  function confirmar() {
    borrar.mutate({ userId, confirmEmail: texto.trim() }, { onSuccess: onClose })
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !borrar.isPending) { setTexto(''); onClose() } }}>
      <DialogContent className="surface">
        <DialogHeader>
          <DialogTitle className="font-serif">Borrar esta cuenta</DialogTitle>
        </DialogHeader>

        {isLoading || !prev ? (
          <Skeleton className="h-40 w-full" style={{ background: 'var(--secondary)' }} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              Vas a borrar <strong>{email}</strong> y todo lo suyo. No se puede deshacer.
            </p>

            <ul className="text-sm space-y-1.5 p-3 rounded-xl" style={{ background: 'var(--secondary)' }}>
              <li>{prev.viajes_propios.length} viaje{prev.viajes_propios.length === 1 ? '' : 's'} suyo{prev.viajes_propios.length === 1 ? '' : 's'}, con todo su contenido</li>
              <li>{prev.ficheros} fichero{prev.ficheros === 1 ? '' : 's'} · {formatBytes(prev.bytes)}</li>
              <li>
                {prev.visitas} visitas y {prev.eventos} acciones{' '}
                <span className="text-muted-foreground">— se anonimizan, no se borran</span>
              </li>
            </ul>

            {prev.colaboradores_afectados.length > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden="true" />
                <p className="text-sm">
                  <strong>Esto afecta a otras personas.</strong> Perderán el acceso a
                  sus viajes: {prev.colaboradores_afectados.join(', ')}.
                </p>
              </div>
            )}

            {prev.viajes_ajenos.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Participa en {prev.viajes_ajenos.length} viaje
                {prev.viajes_ajenos.length === 1 ? '' : 's'} de otras personas. Esos viajes
                NO se borran, pero las fotos y portadas que subió allí sí, porque son
                ficheros suyos: alguna actividad se quedará sin imagen.
              </p>
            )}

            {prev.invitaciones_a_reasignar > 0 && (
              <p className="text-sm text-muted-foreground">
                {prev.invitaciones_a_reasignar} invitación
                {prev.invitaciones_a_reasignar === 1 ? '' : 'es'} que hizo en viajes ajenos
                pasarán a nombre del dueño del viaje, para que esas personas no se queden
                fuera.
              </p>
            )}

            <div>
              <Label htmlFor="confirmar" className="text-sm">
                Escribe <strong>{email}</strong> para confirmar
              </Label>
              <Input
                id="confirmar"
                className="mt-1.5"
                autoComplete="off"
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={email}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={borrar.isPending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive gap-2"
            disabled={!coincide || borrar.isPending}
            onClick={confirmar}
          >
            {borrar.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Borrar para siempre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
