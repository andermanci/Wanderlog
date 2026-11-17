import { createContext } from 'react'

// El panel de actividad cambia de contenido sin cerrarse (ver → editar → elegir
// ubicación…). Cada paso pinta sus botones en el pie fijo del panel a través de
// este hueco, sin que el panel tenga que conocer el estado de cada formulario.
export const FooterSlotContext = createContext<HTMLElement | null>(null)
