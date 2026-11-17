import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// La analítica propia, lado cliente. No renderiza nada.
//
// LO QUE MIDE ES TIEMPO VISIBLE, no tiempo de reloj. Sin eso, «tiempo medio en
// pantalla» acaba siendo «tiempo medio con la pestaña abierta», que es otra
// cosa y siempre sale enorme.

const RUTA = '/api/track'
const CLAVE_SESION = 'wl-sid'
const CLAVE_ORIGEN = 'wl-origen'

/**
 * Espera antes de contar la vista. Mata dos pájaros:
 *
 *   1. El doble montaje de StrictMode en desarrollo cancela la primera
 *      apertura en su limpieza, así que no se apuntan vistas fantasma de 0 ms.
 *   2. Una redirección que pasa por una ruta no es una visita a esa ruta, y
 *      esta app redirige bastante (/ -> /dashboard, /auth/callback -> …).
 */
const ABRIR_TRAS_MS = 400

/** Id de sesión: vive en sessionStorage y MUERE al cerrar la pestaña. No es
 *  una cookie, no viaja en ninguna petición y por eso no hace falta banner. */
let sesionEnMemoria: string | null = null

function idDeSesion(): string {
  try {
    const guardado = sessionStorage.getItem(CLAVE_SESION)
    if (guardado) return guardado
    const nuevo = crypto.randomUUID()
    sessionStorage.setItem(CLAVE_SESION, nuevo)
    return nuevo
  } catch {
    // `sessionStorage` LANZA al LEER en Safari con el almacenamiento
    // bloqueado, no devuelve null. Una analítica que tira la app entera no
    // vale nada. Sin almacén, la visita cuenta como una sesión suelta: peor
    // dato, pero dato.
    sesionEnMemoria ??= crypto.randomUUID()
    return sesionEnMemoria
  }
}

interface Origen { ref: string | null; us: string | null; um: string | null; uc: string | null }

/**
 * De dónde vino esta visita. Se lee UNA vez y se guarda: en la navegación de
 * una SPA el `document.referrer` deja de ser el de fuera en cuanto cambias de
 * pantalla, así que sin esto la segunda vista ya no sabría de dónde llegó.
 */
function procedencia(): Origen {
  try {
    const guardado = sessionStorage.getItem(CLAVE_ORIGEN)
    if (guardado) return JSON.parse(guardado) as Origen
  } catch {
    /* sin almacén se recalcula, que en la primera pantalla es correcto igual */
  }
  const p = new URLSearchParams(location.search)
  const origen: Origen = {
    ref: document.referrer || null,
    us: p.get('utm_source'),
    um: p.get('utm_medium'),
    uc: p.get('utm_campaign'),
  }
  try {
    sessionStorage.setItem(CLAVE_ORIGEN, JSON.stringify(origen))
  } catch {
    /* solo se pierde la procedencia de las pantallas siguientes */
  }
  return origen
}

/** ¿Está corriendo como aplicación instalada? El user-agent de una PWA es
 *  idéntico al del navegador, así que esto solo se sabe desde el cliente. */
function esStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

function enviar(cuerpo: object, beacon: boolean) {
  const json = JSON.stringify(cuerpo)
  // `text/plain` y no `application/json`: es el tipo que `sendBeacon` acepta
  // sin preflight. El endpoint lee con `req.text()` y parsea a mano.
  const tipo = 'text/plain;charset=UTF-8'
  if (beacon && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(RUTA, new Blob([json], { type: tipo }))
    return
  }
  fetch(RUTA, { method: 'POST', body: json, headers: { 'content-type': tipo }, keepalive: true })
    .catch(() => {
      /* una analítica no escupe errores en la consola de nadie */
    })
}

export function Analytics() {
  const { pathname } = useLocation()
  // El token se lee del store en cada vista y NO se captura en el efecto: si
  // la sesión cambia (entrar, salir), la vista siguiente ya lleva el estado
  // nuevo sin necesidad de remontar nada.
  const token = useAuthStore(s => s.session?.access_token ?? null)

  useEffect(() => {
    // `location.pathname` y NUNCA `href`: /invite/<token> lleva un token que
    // da acceso a un viaje ajeno, y la query no puede acabar en la tabla. El
    // servidor lo vuelve a normalizar, pero la primera guarda va aquí.
    const path = pathname || location.pathname
    const id = crypto.randomUUID()
    const sid = idDeSesion()
    const origen = procedencia()
    const pwa = esStandalone()

    let abierta = false
    /** Milisegundos ya acumulados con la pestaña a la vista. */
    let acumulado = 0
    /** Cuándo empezó el tramo visible en curso, o null si está oculta. */
    let desde: number | null = document.visibilityState === 'visible' ? Date.now() : null
    /** Lo último que se mandó, para no reenviar el mismo cierre dos veces. */
    let enviado = -1

    const visibles = () => acumulado + (desde == null ? 0 : Date.now() - desde)

    const abrir = window.setTimeout(() => {
      abierta = true
      enviar({ id, sid, path, pwa, t: token, ...origen }, false)
    }, ABRIR_TRAS_MS)

    const cerrar = (beacon: boolean) => {
      if (!abierta) return   // si la apertura no llegó a salir, no hay fila que cerrar
      const ms = visibles()
      if (ms <= enviado) return
      enviado = ms
      // El cierre es idempotente: sobrescribe la fila por id y `ms` solo
      // crece, así que puede mandarse tantas veces como haga falta.
      //
      // Va con la procedencia OTRA VEZ, aunque parezca repetido: el cierre
      // sobrescribe la fila entera, así que sin esto borraría el referer y los
      // utm que escribió la apertura. Y es lo que permite que el cierre llegue
      // primero —pasa al recargar— sin perder nada.
      enviar({ id, sid, path, pwa, t: token, ...origen, ms, fin: true }, beacon)
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        if (desde != null) acumulado += Date.now() - desde
        desde = null
        // En el móvil, cambiar de aplicación a menudo NO dispara `pagehide`:
        // esta es la única oportunidad de cerrar la vista.
        cerrar(true)
      } else {
        desde = Date.now()
      }
    }

    // `pagehide` y no `beforeunload`: es el único fiable en iOS Safari, que
    // es donde vive buena parte de esta app.
    const alSalir = () => cerrar(true)

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('pagehide', alSalir)

    return () => {
      window.clearTimeout(abrir)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pagehide', alSalir)
      // Navegación interna: aquí sí da tiempo a que salga un fetch normal.
      cerrar(false)
    }
  }, [pathname, token])

  return null
}
