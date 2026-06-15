import { useQuery } from '@tanstack/react-query'

// Tipos de cambio (gratis, sin clave) desde open.er-api.com. rates[X] = unidades
// de X por 1 unidad de la base. Para convertir un importe en moneda `from` a la
// base: importe / rates[from].
export function useExchangeRates(base: string) {
  return useQuery({
    queryKey: ['rates', base],
    enabled: !!base,
    staleTime: 1000 * 60 * 60 * 12, // 12 h: las divisas no cambian tanto
    gcTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: async () => {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
      if (!res.ok) throw new Error('rates')
      const data = await res.json()
      return (data?.rates ?? {}) as Record<string, number>
    },
    retry: 1,
  })
}

// Suma una lista de importes (en distintas divisas) convertidos a `base`.
// Devuelve el total y qué divisas no se pudieron convertir (sin tipo de cambio).
export function sumConverted(
  items: Array<{ amount: number; currency: string }>,
  base: string,
  rates: Record<string, number> | undefined,
): { total: number; missing: string[] } {
  let total = 0
  const missing = new Set<string>()
  for (const it of items) {
    if (it.currency === base) { total += it.amount; continue }
    const rate = rates?.[it.currency]
    if (rate && rate > 0) total += it.amount / rate
    else missing.add(it.currency)
  }
  return { total, missing: [...missing] }
}
