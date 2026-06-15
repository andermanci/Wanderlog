import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initA11y } from './store/a11yStore'

// Aplica tema y tamaño de texto antes del primer render (evita parpadeo).
initA11y()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
