/** Texto de la confirmación de borrado de un viaje (lista de viajes y ajustes del viaje). */
export function deleteTripCopy(name: string) {
  return {
    title: '¿Eliminar este viaje?',
    description: `Se borrará «${name}» con todo lo que tiene: plan, documentos, gastos y lugares guardados. No se puede deshacer.`,
    confirmLabel: 'Eliminar viaje',
  }
}

/** «12 – 18 jun 2026», «28 jun – 3 jul 2026». */
export function dateRange(start: string, end: string, fmt: (d: string, f: string) => string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  if (start === end) return fmt(start, 'd MMM yyyy')
  if (sameMonth) return `${fmt(start, 'd')} – ${fmt(end, 'd MMM yyyy')}`
  if (sameYear) return `${fmt(start, 'd MMM')} – ${fmt(end, 'd MMM yyyy')}`
  return `${fmt(start, 'd MMM yyyy')} – ${fmt(end, 'd MMM yyyy')}`
}
