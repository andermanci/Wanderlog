import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, BookHeart, FileText, MapPin, Plus, Receipt, Sparkles, type LucideIcon } from 'lucide-react'
import { Button, Menu, Panel, useIsMobile, type Tone } from '@/design'
import { cn } from '@/lib/utils'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { quickAddTargets } from './nav'

interface Target { key: keyof ReturnType<typeof quickAddTargets>; label: string; hint: string; icon: LucideIcon; tone: Tone }

const TARGETS: Target[] = [
  { key: 'actividad', label: 'Actividad', hint: 'Visita, vuelo, hotel, cena…', icon: Sparkles, tone: 'activity' },
  { key: 'lugar', label: 'Lugar', hint: 'Un sitio que quieres ver', icon: MapPin, tone: 'place' },
  { key: 'gasto', label: 'Gasto', hint: 'Lo que has pagado', icon: Receipt, tone: 'restaurant' },
  { key: 'documento', label: 'Billete o documento', hint: 'Reservas, entradas, seguros…', icon: FileText, tone: 'flight' },
  { key: 'aviso', label: 'Aviso', hint: 'Para que no se te pase', icon: Bell, tone: 'hotel' },
  { key: 'diario', label: 'Nota de diario', hint: 'Lo que ha pasado hoy', icon: BookHeart, tone: 'primary' },
]

/**
 * ¿Hay que apartar el botón flotante? Se esconde al bajar por la pantalla (se
 * está leyendo: no debe tapar importes ni flechas) y vuelve al subir, al llegar
 * arriba o al final. Escucha en captura porque cada pantalla tiene su propio
 * contenedor de scroll (el del armazón, o los del Plan).
 */
function useHiddenWhileReading(resetKey: string): boolean {
  const [hidden, setHidden] = useState(false)
  // Al cambiar de pantalla vuelve a estar a mano.
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) { setKey(resetKey); setHidden(false) }

  useEffect(() => {
    const last = new WeakMap<Element, number>()
    const onScroll = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      // Lo que se mueve dentro de un panel o un menú no es la pantalla.
      if (el.closest('[role="dialog"], [role="menu"]')) return
      const top = el.scrollTop
      const prev = last.get(el)
      last.set(el, top)
      if (prev === undefined) return
      const delta = top - prev
      if (delta === 0) return // desplazamiento horizontal (filas de chips, carruseles)
      const atEnd = top + el.clientHeight >= el.scrollHeight - 24
      if (top < 48 || atEnd || delta < -6) setHidden(false)
      else if (delta > 6) setHidden(true)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  return hidden
}

/**
 * El «+» del viaje: un único sitio para añadir cualquier cosa.
 * Escritorio: botón en la barra superior con menú. Móvil: botón flotante con hoja.
 * No se muestra a quien solo puede ver el viaje.
 */
export function QuickAdd({ tripId, floating }: { tripId: string; floating?: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mobile = useIsMobile()
  const reading = useHiddenWhileReading(pathname)
  const { data: role } = useTripRole(tripId)
  const [open, setOpen] = useState(false)
  const to = quickAddTargets(tripId)

  if (!canEditRole(role)) return null

  if (floating) {
    // El flotante es solo de móvil: en escritorio el «+» ya está en la barra.
    if (!mobile) return null
    // En Ajustes del viaje no hay nada que añadir, y abajo están duplicar y eliminar.
    const away = reading || pathname.endsWith('/settings')
    return (
      <>
        <button
          type="button"
          aria-label="Añadir"
          title="Añadir"
          // Escondido no se puede pulsar ni enfocar.
          tabIndex={away ? -1 : undefined}
          aria-hidden={away || undefined}
          onClick={() => setOpen(true)}
          className={cn(
            'no-print fixed right-4 z-30 grid size-13 place-items-center rounded-full bg-primary text-primary-foreground shadow-float',
            'bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] transition-[transform,opacity] duration-200 ease-out active:scale-95',
            away && 'pointer-events-none translate-y-6 scale-75 opacity-0',
          )}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
        <Panel open={open} onOpenChange={setOpen} title="¿Qué quieres añadir?">
          {/* Seis destinos a la vista y al alcance del pulgar, sin lista que recorrer. */}
          <ul className="grid grid-cols-2 gap-2.5">
            {TARGETS.map(t => (
              <li key={t.key} data-tone={t.tone}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate(to[t.key]) }}
                  className="flex h-full min-h-24 w-full flex-col justify-between gap-3 rounded-2xl border border-tone-line bg-tone-soft p-3.5 text-left transition-transform duration-150 active:scale-[0.97]"
                >
                  <t.icon className="size-6 text-tone" aria-hidden="true" />
                  <span className="block min-w-0">
                    <span className="block font-serif text-lg font-medium leading-tight">{t.label}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{t.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
