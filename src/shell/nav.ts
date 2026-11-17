import {
  Home, CalendarRange, BookOpen, Wallet, Receipt, Luggage, Bell, Heart, Settings,
  Plane, CalendarDays, type LucideIcon,
} from 'lucide-react'

// LA lista de sitios de la app. Barra superior, barra inferior, buscador e
// Inicio del viaje salen de aquí: no hay otra lista que pueda desincronizarse.

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  to: string
  /** ¿Esta ruta pertenece a este sitio? */
  match: (pathname: string) => boolean
}

const under = (base: string) => (p: string) => p === base || p.startsWith(base + '/')

/** Las cinco pestañas de un viaje. */
export function tripTabs(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`
  const isAudioguide = (p: string) => p.endsWith('/audioguide')
  const isPlan = (p: string) =>
    !isAudioguide(p) && (under(`${base}/itinerary`)(p) || under(`${base}/map`)(p) || under(`${base}/places`)(p))
  const isGuide = (p: string) => under(`${base}/guide`)(p) || (p.startsWith(base) && isAudioguide(p))
  const isWallet = under(`${base}/documents`)
  const isMoney = under(`${base}/expenses`)
  return [
    {
      key: 'inicio', label: 'Inicio', icon: Home, to: base,
      // Inicio es también la casa de lo que cuelga de él (equipaje, avisos, recuerdo, ajustes).
      match: p => p.startsWith(base) && !isPlan(p) && !isGuide(p) && !isWallet(p) && !isMoney(p),
    },
    { key: 'plan', label: 'Plan', icon: CalendarRange, to: `${base}/itinerary`, match: isPlan },
    { key: 'guia', label: 'Guía', icon: BookOpen, to: `${base}/guide`, match: isGuide },
    { key: 'cartera', label: 'Cartera', icon: Wallet, to: `${base}/documents`, match: isWallet },
    { key: 'gastos', label: 'Gastos', icon: Receipt, to: `${base}/expenses`, match: isMoney },
  ]
}

/** Lo que cuelga de Inicio: se llega desde sus tarjetas, el menú «⋯» y el buscador. */
export function tripExtras(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`
  return [
    { key: 'equipaje', label: 'Equipaje', icon: Luggage, to: `${base}/packing`, match: under(`${base}/packing`) },
    { key: 'avisos', label: 'Avisos', icon: Bell, to: `${base}/reminders`, match: under(`${base}/reminders`) },
    { key: 'recuerdo', label: 'Recuerdo del viaje', icon: Heart, to: `${base}/memory`, match: under(`${base}/memory`) },
    { key: 'ajustes', label: 'Ajustes del viaje', icon: Settings, to: `${base}/settings`, match: under(`${base}/settings`) },
  ]
}

/** Fuera de un viaje. */
export const GLOBAL_NAV: NavItem[] = [
  { key: 'viajes', label: 'Viajes', icon: Plane, to: '/dashboard', match: p => p === '/dashboard' || p.startsWith('/import') },
  { key: 'calendario', label: 'Calendario', icon: CalendarDays, to: '/calendar', match: under('/calendar') },
  { key: 'ajustes', label: 'Ajustes', icon: Settings, to: '/settings', match: under('/settings') },
]

/**
 * Qué puede crear el botón «+» dentro de un viaje. Cada destino abre su panel de
 * alta al recibir `?nuevo=1` (contrato común de todas las secciones).
 */
export const quickAddTargets = (tripId: string) => ({
  actividad: `/trips/${tripId}/itinerary/new`,
  lugar: `/trips/${tripId}/itinerary?tab=ideas&buscar=1`,
  gasto: `/trips/${tripId}/expenses?nuevo=1`,
  documento: `/trips/${tripId}/documents?nuevo=1`,
  aviso: `/trips/${tripId}/reminders?nuevo=1`,
  diario: `/trips/${tripId}/itinerary?diario=hoy`,
})
