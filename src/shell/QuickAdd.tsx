import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BookHeart, FileText, MapPin, Plus, Receipt, Sparkles, type LucideIcon } from 'lucide-react'
import { Button, Menu, Panel, Row, RowList, useIsMobile, type Tone } from '@/design'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { quickAddTargets } from './nav'

interface Target { key: keyof ReturnType<typeof quickAddTargets>; label: string; hint: string; icon: LucideIcon; tone: Tone }

const TARGETS: Target[] = [
  { key: 'actividad', label: 'Actividad', hint: 'Una visita, un vuelo, un hotel, una cena…', icon: Sparkles, tone: 'activity' },
  { key: 'lugar', label: 'Lugar', hint: 'Guarda un sitio que quieres ver', icon: MapPin, tone: 'place' },
  { key: 'gasto', label: 'Gasto', hint: 'Apunta lo que has pagado', icon: Receipt, tone: 'restaurant' },
  { key: 'documento', label: 'Billete o documento', hint: 'Reservas, entradas, seguros, pasaportes', icon: FileText, tone: 'flight' },
  { key: 'aviso', label: 'Aviso', hint: 'Que te lo recordemos a tiempo', icon: Bell, tone: 'hotel' },
  { key: 'diario', label: 'Nota de diario', hint: 'Lo que ha pasado hoy', icon: BookHeart, tone: 'primary' },
]

/**
 * El «+» del viaje: un único sitio para añadir cualquier cosa.
 * Escritorio: botón en la barra superior con menú. Móvil: botón flotante con hoja.
 * No se muestra a quien solo puede ver el viaje.
 */
export function QuickAdd({ tripId, floating }: { tripId: string; floating?: boolean }) {
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { data: role } = useTripRole(tripId)
  const [open, setOpen] = useState(false)
  const to = quickAddTargets(tripId)

  if (!canEditRole(role)) return null

  if (floating) {
    // El flotante es solo de móvil: en escritorio el «+» ya está en la barra.
    if (!mobile) return null
    return (
      <>
        <button
          type="button"
          aria-label="Añadir"
          onClick={() => setOpen(true)}
          className="fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-float transition-transform active:scale-95 bottom-[calc(env(safe-area-inset-bottom)+5rem)] no-print"
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
        <Panel open={open} onOpenChange={setOpen} title="¿Qué quieres añadir?">
          <RowList>
            {TARGETS.map(t => (
              <Row
                key={t.key} icon={t.icon} tone={t.tone} title={t.label} subtitle={t.hint} chevron
                onClick={() => { setOpen(false); navigate(to[t.key]) }}
              />
            ))}
          </RowList>
        </Panel>
      </>
    )
  }

  return (
    <Menu
      trigger={<Button variant="primary" size="sm"><Plus /> Añadir</Button>}
      items={TARGETS.map(t => ({ label: t.label, hint: t.hint, icon: t.icon, onSelect: () => navigate(to[t.key]) }))}
    />
  )
}
