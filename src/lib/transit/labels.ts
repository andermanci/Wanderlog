import type { GeoPoint } from '@/lib/travelTime'
import type { TransitAlternative, TransitRoute, TransitSkipReason } from '@/types/database'
import { transitVerdict, type TransitVerdict } from './exchange'

// Más allá de esto (en minutos andando) no se compara con ir a pie.
export const WALK_RELEVANT_MAX_MIN = 60

// Textos de por qué no compensa el transporte público y qué hacer en su lugar.

export const SKIP_REASON: Record<TransitSkipReason, string> = {
  cerca: 'Está muy cerca',
  sin_linea: 'No hay una línea que lo haga bien',
  transbordos: 'Demasiados transbordos',
  lento: 'En transporte público se tarda mucho más',
  horario: 'A esa hora apenas hay servicio',
  otro: 'El transporte público no compensa',
}

export const ALTERNATIVE_TITLE: Record<TransitAlternative, string> = {
  walk: 'Mejor andando',
  taxi: 'Mejor en taxi',
  car: 'Mejor en coche',
}

/** "Está muy cerca: mejor andando". Para la línea bajo la píldora. */
export function skipSummary(route: TransitRoute, from: GeoPoint, to: GeoPoint): string {
  const { reason, alternative, coordsSuspect } = transitVerdict(route, from, to)
  const text = SKIP_REASON[reason ?? 'otro']
  const base = alternative ? `${text}: ${ALTERNATIVE_TITLE[alternative].toLowerCase()}` : text
  return coordsSuspect ? `${base} · revisa la ubicación` : base
}

/** "Ginza Line: Oshiage → Inaricho; a pie al final". Para recordarle a la IA qué propuso. */
export function describeRoute(route: TransitRoute): string {
  const rides = (route.steps ?? []).filter(s => s.kind !== 'walk')
  if (!route.worth_it && rides.length === 0) return `que no compensa (${SKIP_REASON[route.skip_reason ?? 'otro'].toLowerCase()})`
  return rides.map(s => `${s.line ?? 'línea'} de ${s.from_station ?? '?'} a ${s.to_station ?? '?'}`).join(', luego ')
}

/**
 * La frase que explica la decisión con números, comparando con ir andando:
 * "Andando son 29 min; así tardas 25 y solo caminas 5." o "En transporte
 * público serían 25 min: 10 andando, 3 esperando y 12 en la Ginza Line.
 * Andando (22 min) llegas antes y sin esperas."
 */
export function verdictExplanation(v: TransitVerdict, lineName: string | null): string | null {
  const b = v.breakdown
  const W = v.walkMinutes
  if (!b) return null
  // Lejos, andar no es una opción real: lo útil es saber cuánto se camina.
  if (v.worth && W > WALK_RELEVANT_MAX_MIN) {
    return b.walk > 0 ? `Caminas ${b.walk} de los ${b.total} min.` : null
  }
  if (v.worth && v.why === 'faster') {
    const walkText = b.walk === 0 ? '' : b.walk <= W / 2 ? ` y solo caminas ${b.walk}` : ` (aunque caminas ${b.walk})`
    return `Llegas ${W - b.total} min antes que andando (${W} min)${walkText}.`
  }
  if (v.worth && v.why === 'less_walking') {
    return b.total <= W
      ? `Andando son ${W} min; así tardas ${b.total} y solo caminas ${b.walk}.`
      : `Andando llegarías ${b.total - W} min antes, pero así caminas ${b.walk} min en vez de ${W}.`
  }
  if (!v.worth && v.alternative === 'walk') {
    const parts = [`${b.walk} andando`, b.wait > 0 ? `${b.wait} esperando` : null, `${b.ride} en ${lineName ?? 'el transporte'}`].filter(Boolean)
    const last = parts.pop()
    return `En transporte público serían ${b.total} min: ${parts.join(', ')} y ${last}. `
      + (W <= b.total ? `Andando (${W} min) llegas antes y sin esperas.` : `Andando (${W} min) tardas casi lo mismo, sin esperas ni transbordos.`)
  }
  return null
}
