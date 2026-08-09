import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteTripOffline, describeOfflineIndex, readOfflineIndex } from '@/lib/offlineIndex'
import { toast } from 'sonner'

// Lo que este viaje ocupa en el móvil, en los ajustes del viaje. La descarga se
// hace desde la pantalla del viaje; aquí solo se ve y se borra, que es lo que
// vienes buscando cuando andas justo de espacio.
export function OfflineDataSection({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const [index, setIndex] = useState(() => readOfflineIndex(tripId))
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setConfirm(false)
    setBusy(true)
    await deleteTripOffline(qc, tripId).catch(() => {})
    setIndex(null)
    setBusy(false)
    toast.success('Copia sin conexión eliminada')
  }

  const detail = index ? describeOfflineIndex(index) : ''

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <WifiOff size={18} style={{ color: 'var(--primary)' }} />
        <h2 className="font-serif text-xl">Sin conexión</h2>
      </div>
      <div className="p-6 rounded-xl flex items-center justify-between gap-3 surface">
        <div className="min-w-0">
          <p className="font-medium text-sm">Datos descargados</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {index
              ? `Este viaje está guardado en el móvil${detail ? ` (${detail})` : ''}. Al borrarlo se libera ese sitio; el viaje sigue en tu cuenta y vuelve en cuanto haya conexión.`
              : 'No hay nada descargado de este viaje. Puedes guardarlo desde la pantalla del viaje, en «Guardar viaje sin conexión».'}
          </p>
        </div>
        {index && (
          <Button
            variant="outline"
            className="gap-1.5 flex-shrink-0 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Borrar
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Borrar los datos descargados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se libera el sitio que ocupa este viaje en el móvil{detail ? ` (${detail})` : ''}: fotos,
              audios, documentos y los datos guardados. No se borra nada del viaje, que sigue en tu
              cuenta y vuelve a estar aquí en cuanto tengas conexión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void remove()}
              style={{ background: 'var(--destructive)', color: 'white' }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
