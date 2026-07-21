import { useEffect, useState } from 'react'
import { Loader2, Landmark } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePreviewRevolut, useImportRevolut, type RevolutCandidate } from '@/lib/queries/revolut'
import { formatCurrency, formatDate } from '@/lib/utils'

interface RevolutImportDialogProps {
  open: boolean
  onClose: () => void
  tripId: string
}

export function RevolutImportDialog({ open, onClose, tripId }: RevolutImportDialogProps) {
  const preview = usePreviewRevolut(tripId)
  const importMut = useImportRevolut(tripId)
  const [candidates, setCandidates] = useState<RevolutCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)

  const previewMutate = preview.mutate
  useEffect(() => {
    if (!open) return
    setCandidates([])
    setSelected(new Set())
    setPending(false)
    previewMutate(undefined, {
      onSuccess: (res) => {
        if (res.pending) { setPending(true); return }
        setCandidates(res.candidates)
        // Preseleccionamos los del viaje que aún no están importados.
        setSelected(new Set(
          res.candidates.filter(c => c.inTripRange && !c.alreadyImported).map(c => c.external_id)
        ))
      },
    })
  }, [open, tripId, previewMutate])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleImport() {
    importMut.mutate([...selected], { onSuccess: onClose })
  }

  const duringTrip = candidates.filter(c => c.inTripRange)
  const beforeTrip = candidates.filter(c => !c.inTripRange)
  const loading = preview.isPending

  function row(c: RevolutCandidate) {
    const disabled = c.alreadyImported
    return (
      <label
        key={c.external_id}
        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer ${disabled ? 'opacity-50 cursor-default' : 'hover:bg-secondary'}`}
      >
        <Checkbox
          checked={disabled ? true : selected.has(c.external_id)}
          disabled={disabled}
          onCheckedChange={() => !disabled && toggle(c.external_id)}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-1">{c.description}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(c.date)}{c.alreadyImported && ' · ya importado'}
          </p>
        </div>
        <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--primary)' }}>
          {formatCurrency(c.amount, c.currency)}
        </span>
      </label>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark size={18} /> Importar de Revolut</DialogTitle>
          <DialogDescription>
            Marca los movimientos que quieras añadir como gastos. Los del viaje vienen
            preseleccionados; marca también las reservas previas (hoteles, vuelos…).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-sm">Leyendo tus movimientos…</span>
          </div>
        ) : pending ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            La conexión aún está pendiente. Completa el consentimiento en Revolut y vuelve a intentarlo.
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No se han encontrado movimientos en el rango de fechas.
          </p>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-2 -mr-2">
            {duringTrip.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1 px-1">Durante el viaje</p>
                {duringTrip.map(row)}
              </div>
            )}
            {beforeTrip.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1 px-1">Reservas previas al viaje</p>
                {beforeTrip.map(row)}
              </div>
            )}
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={loading || pending || selected.size === 0 || importMut.isPending}
            variant="brand"
            className="gap-2"
          >
            {importMut.isPending && <Loader2 size={14} className="animate-spin" />}
            Importar {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
