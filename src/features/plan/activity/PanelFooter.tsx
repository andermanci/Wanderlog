import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FooterSlotContext } from './footerSlot'

/** Botones del paso actual, colocados en el pie fijo del panel de actividad. */
export function PanelFooter({ children }: { children: ReactNode }) {
  const slot = useContext(FooterSlotContext)
  return slot ? createPortal(children, slot) : null
}
