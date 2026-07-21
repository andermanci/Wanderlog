import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { CollaboratorsManager } from '@/components/trips/CollaboratorsManager'

interface ShareTripDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
}

export function ShareTripDialog({ open, onClose, tripId }: ShareTripDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <DialogHeader>
          <DialogTitle>Compartir viaje</DialogTitle>
          <DialogDescription>
            Le llegará un correo con un enlace para unirse (no hace falta que
            tenga cuenta: se crea al abrirlo). Entra con permiso de solo
            lectura; puedes subirle el nivel (editar, o editar y compartir)
            desde aquí o desde Ajustes del viaje.
          </DialogDescription>
        </DialogHeader>
        <CollaboratorsManager tripId={tripId} />
      </DialogContent>
    </Dialog>
  )
}
