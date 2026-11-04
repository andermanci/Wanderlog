import { useEffect, useMemo, useState } from 'react'
import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap } from '@vis.gl/react-google-maps'
import { BedDouble, WifiOff } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { GeoPoint } from '@/lib/travelTime'
import { nearMedian, type SketchPoint } from '@/lib/versions/sketch'
import { SIDE, soft } from './versionStyle'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''
// Las polilíneas de Google se pintan en canvas y no entienden las variables CSS
// (ni oklch): los mismos tonos que --info y --primary, en hex.
const HEX = { a: '#3d68c9', b: '#bf4d22' } as const

type Show = 'both' | 'a' | 'b'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string | null
  a: SketchPoint[]
  b: SketchPoint[]
  hotel?: (GeoPoint & { title?: string }) | null
}

// El croquis del día, en grande y sobre el mapa de verdad: para ver por qué
// calles pasa cada versión. Se pide a Google solo al abrirlo (por eso lleva su
// propio APIProvider). Las líneas unen paradas en recto, sin Directions: es
// para comparar recorridos, y así no se gasta una llamada por tramo.
export function RouteMapDialog({ open, onOpenChange, title, subtitle, a, b, hotel }: Props) {
  const online = useOnlineStatus()
  const [show, setShow] = useState<Show>('both')
  const [focus, setFocus] = useState<{ side: 'a' | 'b'; n: number } | null>(null)

  const clipped = useMemo(() => {
    const keep = nearMedian([...a, ...b])
    const A = a.filter(keep), B = b.filter(keep), H = hotel && keep(hotel) ? hotel : null
    return { a: A, b: B, hotel: H, all: [...A, ...B, ...(H ? [H] : [])] }
  }, [a, b, hotel])

  const list = show === 'a' ? clipped.a.map(p => ({ ...p, side: 'a' as const })) : clipped.b.map(p => ({ ...p, side: 'b' as const }))

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setFocus(null); setShow('both') } onOpenChange(o) }}>
      <DialogContent
        className="left-0 top-0 translate-x-0 translate-y-0 w-screen max-w-none h-[100dvh] max-h-none rounded-none border-0 p-0 gap-0 flex flex-col overflow-hidden data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-4 pr-14 py-3 border-b border-border bg-card">
          <div className="min-w-0 mr-auto">
            <DialogTitle className="font-serif text-lg font-medium leading-tight capitalize">{title}</DialogTitle>
            <DialogDescription className="text-xs">{subtitle ?? 'Recorrido del día'}</DialogDescription>
          </div>
          <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--secondary)' }} role="radiogroup" aria-label="Qué versión mostrar">
            {([['both', 'A y B'], ['a', 'Solo A'], ['b', 'Solo B']] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={show === v} onClick={() => { setShow(v); setFocus(null) }}
                className="h-7 px-2.5 text-xs font-medium rounded-md transition-colors"
                style={show === v
                  ? { background: 'var(--card)', color: v === 'a' ? SIDE.a.color : v === 'b' ? SIDE.b.color : 'var(--foreground)', boxShadow: '0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent)' }
                  : { color: 'var(--muted-foreground)' }}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="relative flex-1 min-h-0">
          {online ? (
            <APIProvider apiKey={API_KEY}>
              <Map
                defaultCenter={clipped.b[0] ?? clipped.a[0] ?? { lat: 0, lng: 0 }}
                defaultZoom={13}
                mapId="wanderlog-map"
                colorScheme={ColorScheme.FOLLOW_SYSTEM}
                gestureHandling="greedy"
                disableDefaultUI
                zoomControl
                // Con zoom entero, el día de una ciudad grande cae justo entre dos
                // niveles en un móvil y se queda en el de más lejos.
                isFractionalZoomEnabled
                className="w-full h-full"
              >
                <FitAll points={clipped.all} open={open} />
                <FocusOn point={focus ? (focus.side === 'a' ? clipped.a : clipped.b).find(p => p.n === focus.n) ?? null : null} />
                {show !== 'b' && <Line points={clipped.a} color={HEX.a} dashed hotel={clipped.hotel} />}
                {show !== 'a' && <Line points={clipped.b} color={HEX.b} hotel={clipped.hotel} />}

                {clipped.hotel && (
                  <AdvancedMarker position={clipped.hotel} zIndex={30} title={clipped.hotel.title ?? 'Hotel'}>
                    <div className="w-7 h-7 rounded-lg grid place-items-center shadow-lg border-2 border-white" style={{ background: 'var(--foreground)', color: 'var(--card)' }}>
                      <BedDouble size={14} />
                    </div>
                  </AdvancedMarker>
                )}
                {show !== 'b' && clipped.a.map(p => (
                  <AdvancedMarker key={`a${p.n}`} position={p} zIndex={focus?.side === 'a' && focus.n === p.n ? 40 : 10}
                    title={p.title} onClick={() => setFocus({ side: 'a', n: p.n })}>
                    <div className="p-2 cursor-pointer">
                      <div className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shadow-md transition-transform"
                        style={{ background: 'white', color: HEX.a, border: `2.5px solid ${HEX.a}`, transform: focus?.side === 'a' && focus.n === p.n ? 'scale(1.3)' : undefined }}>
                        {p.n}
                      </div>
                    </div>
                  </AdvancedMarker>
                ))}
                {show !== 'a' && clipped.b.map(p => (
                  <AdvancedMarker key={`b${p.n}`} position={p} zIndex={focus?.side === 'b' && focus.n === p.n ? 40 : 20}
                    title={p.title} onClick={() => setFocus({ side: 'b', n: p.n })}>
                    <div className="p-2 cursor-pointer">
                      <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-white shadow-lg border-2 border-white transition-transform"
                        style={{ background: p.eat ? '#a3354a' : HEX.b, transform: focus?.side === 'b' && focus.n === p.n ? 'scale(1.3)' : undefined }}>
                        {p.n}
                      </div>
                    </div>
                  </AdvancedMarker>
                ))}
              </Map>
            </APIProvider>
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground px-6 text-center">
              <p className="flex flex-col items-center gap-2"><WifiOff size={20} />Sin conexión no se puede cargar el mapa.</p>
            </div>
          )}

          {/* Leyenda */}
          <div className="absolute left-3 top-3 rounded-xl px-3 py-2 text-[11px] flex flex-col gap-1 shadow-md backdrop-blur"
            style={{ background: 'color-mix(in srgb, var(--card) 90%, transparent)' }}>
            {show !== 'b' && <span className="flex items-center gap-2"><svg width="22" height="4" aria-hidden><line x1="0" y1="2" x2="22" y2="2" stroke={HEX.a} strokeWidth="3" strokeDasharray="4 3" /></svg>Versión A</span>}
            {show !== 'a' && <span className="flex items-center gap-2"><svg width="22" height="4" aria-hidden><line x1="0" y1="2" x2="22" y2="2" stroke={HEX.b} strokeWidth="4" /></svg>Versión B</span>}
            <span className="text-muted-foreground">Líneas rectas entre paradas</span>
          </div>
        </div>

        {/* Paradas: tocar una centra el mapa en ella */}
        {list.length > 0 && (
          <div className="border-t border-border bg-card">
            <ol className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
              {list.map(p => {
                const active = focus?.side === p.side && focus.n === p.n
                return (
                  <li key={`${p.side}${p.n}`} className="shrink-0">
                    <button type="button" onClick={() => setFocus({ side: p.side, n: p.n })}
                      className="flex items-center gap-2 max-w-[240px] rounded-full border pl-1 pr-3 py-1 text-sm transition-colors"
                      style={{ borderColor: active ? SIDE[p.side].color : 'var(--border)', background: active ? soft(SIDE[p.side].color, 10) : undefined }}>
                      <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0"
                        style={p.side === 'b' ? { background: p.eat ? '#a3354a' : HEX.b, color: 'white' } : { border: `2px solid ${HEX.a}`, color: HEX.a }}>{p.n}</span>
                      <span className="truncate">{p.title}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Encuadra todas las paradas. El mapa nace dentro de un diálogo que aún se está
// animando y Google cachea el tamaño del contenedor: sin el resize sale encogido.
function FitAll({ points, open }: { points: GeoPoint[]; open: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !open || points.length === 0) return
    const fit = () => {
      google.maps.event.trigger(map, 'resize')
      const bounds = new google.maps.LatLngBounds()
      points.forEach(p => bounds.extend(p))
      // En móvil, 56 px por lado son casi un tercio del ancho.
      const side = map.getDiv().clientWidth < 500 ? 24 : 56
      map.fitBounds(bounds, { top: 90, right: side, bottom: 40, left: side })
      if (points.length === 1) map.setZoom(16)
    }
    // El último, cuando el diálogo ya ha terminado de animarse.
    const timers = [80, 400, 900].map(ms => setTimeout(fit, ms))
    return () => timers.forEach(clearTimeout)
  }, [map, open, points])
  return null
}

function FocusOn({ point }: { point: GeoPoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !point) return
    map.panTo(point)
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
  }, [map, point])
  return null
}

function Line({ points, color, dashed, hotel }: { points: GeoPoint[]; color: string; dashed?: boolean; hotel?: GeoPoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || points.length === 0) return
    const lines: google.maps.Polyline[] = []
    if (dashed) {
      lines.push(new google.maps.Polyline({
        map, path: points, strokeOpacity: 0, zIndex: 1,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, strokeWeight: 3.5, scale: 3 }, offset: '0', repeat: '14px' }],
      }))
    } else {
      // Borde blanco debajo para que se lea sobre cualquier fondo del mapa.
      lines.push(new google.maps.Polyline({ map, path: points, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 8, zIndex: 2 }))
      lines.push(new google.maps.Polyline({ map, path: points, strokeColor: color, strokeOpacity: 1, strokeWeight: 4.5, zIndex: 3 }))
    }
    // Ida y vuelta al hotel, más discretas.
    if (hotel) {
      for (const path of [[hotel, points[0]], [points[points.length - 1], hotel]]) {
        lines.push(new google.maps.Polyline({
          map, path, strokeOpacity: 0, zIndex: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.55, strokeColor: color, strokeWeight: 2, scale: 2 }, offset: '0', repeat: '10px' }],
        }))
      }
    }
    return () => lines.forEach(l => l.setMap(null))
  }, [map, points, color, dashed, hotel])
  return null
}
