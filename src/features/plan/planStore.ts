import { create } from 'zustand'

// Lo que comparten la lista de días y el mapa del Plan, que son hermanos y no
// se pasan props: qué actividad se está señalando, qué se quiere ver en el mapa
// y de qué día se dibuja el recorrido.
//
// La VISTA (días / ideas / mapa) no vive aquí sino en la URL (`?tab=` y
// `?vista=mapa`), para que se pueda enlazar y sobreviva a recargar.

export type MapFocus =
  | { kind: 'activity'; id: string }
  | { kind: 'place'; id: string }

interface PlanState {
  /** Actividad bajo el ratón en la lista (o su pin en el mapa): se resalta en el otro lado. */
  hoveredActivityId: string | null
  setHoveredActivity: (id: string | null) => void
  /** Algo que el mapa debe centrar y destacar. `nonce` cambia en cada petición para poder repetirla. */
  focus: (MapFocus & { nonce: number }) | null
  focusOnMap: (focus: MapFocus | null) => void
  /** Día cuyo recorrido se dibuja en el mapa: su id, o 'all' para todo el viaje. */
  mapDayId: string
  setMapDay: (dayId: string) => void
}

export const usePlanStore = create<PlanState>()(set => ({
  hoveredActivityId: null,
  setHoveredActivity: id => set({ hoveredActivityId: id }),
  focus: null,
  focusOnMap: focus => set({ focus: focus ? { ...focus, nonce: Date.now() } : null }),
  mapDayId: 'all',
  setMapDay: mapDayId => set({ mapDayId }),
}))
