import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CURRENCIES } from '@/lib/utils'

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

// Lista de divisas disponibles (códigos ISO) tomada de la propia API de tipos de
// cambio: así el selector ofrece ~160 divisas sin mantener una lista a mano. Las
// «comunes» van primero; si no hay red se cae en la lista estática.
export function useCurrencyCodes(): string[] {
  const { data } = useExchangeRates('EUR')
  return useMemo(() => {
    if (!data) return CURRENCIES
    const all = Object.keys(data).sort()
    const rest = all.filter(c => !CURRENCIES.includes(c))
    return [...CURRENCIES, ...rest]
  }, [data])
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
