import { useEffect, useMemo, useState } from 'react'
import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap } from '@vis.gl/react-google-maps'
import { BedDouble, WifiOff } from 'lucide-react'
import { Modal, Segmented, type Tone } from '@/design'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { GeoPoint } from '@/lib/travelTime'
import { nearMedian, type SketchPoint } from '@/lib/versions/sketch'
import { SIDE_TONE, toneHex, type Side } from './versionStyle'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? ''

type Show = 'both' | Side

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
// propio APIProvider: el comparador no está dentro del Plan). Las líneas unen
// paradas en recto, sin Directions: es para comparar recorridos, y así no se
// gasta una llamada por tramo.
export function RouteMapModal({ open, onOpenChange, title, subtitle, a, b, hotel }: Props) {
  const online = useOnlineStatus()
  const [show, setShow] = useState<Show>('both')
  const [focus, setFocus] = useState<{ side: Side; n: number } | null>(null)

  const clipped = useMemo(() => {
    const keep = nearMedian([...a, ...b])
    const A = a.filter(keep), B = b.filter(keep), H = hotel && keep(hotel) ? hotel : null
    return { a: A, b: B, hotel: H, all: [...A, ...B, ...(H ? [H] : [])] }
  }, [a, b, hotel])

  const list = show === 'a' ? clipped.a.map(p => ({ ...p, side: 'a' as const })) : clipped.b.map(p => ({ ...p, side: 'b' as const }))
  const isFocus = (side: Side, n: number) => focus?.side === side && focus.n === n

  return (
    <Modal
      open={open}
      onOpenChange={o => { if (!o) { setFocus(null); setShow('both') } onOpenChange(o) }}
      size="full"
      title={<span className="inline-block first-letter:uppercase">{title}</span>}
      description={subtitle ?? 'Recorrido del día'}
    >
      <div className="flex h-full min-h-[70dvh] flex-col gap-3">
        <Segmented<Show>
          label="Qué versión mostrar"
          size="sm"
          value={show}
          onChange={v => { setShow(v); setFocus(null) }}
          options={[{ value: 'both', label: 'A y B' }, { value: 'a', label: 'Solo A' }, { value: 'b', label: 'Solo B' }]}
          className="self-start"
        />

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-sunken">
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
                className="size-full"
              >
                <FitAll points={clipped.all} open={open} />
                <FocusOn point={focus ? (focus.side === 'a' ? clipped.a : clipped.b).find(p => p.n === focus.n) ?? null : null} />
                {show !== 'b' && <Line points={clipped.a} tone={SIDE_TONE.a} dashed hotel={clipped.hotel} />}
                {show !== 'a' && <Line points={clipped.b} tone={SIDE_TONE.b} hotel={clipped.hotel} />}

                {clipped.hotel && (
                  <AdvancedMarker position={clipped.hotel} zIndex={30} title={clipped.hotel.title ?? 'Hotel'}>
                    <div className="grid size-7 place-items-center rounded-lg border-2 border-card bg-foreground text-background shadow-raised">
                      <BedDouble className="size-3.5" aria-hidden="true" />
                    </div>
                  </AdvancedMarker>
                )}
                {show !== 'b' && clipped.a.map(p => (
                  <AdvancedMarker key={`a${p.n}`} position={p} zIndex={isFocus('a', p.n) ? 40 : 10} title={p.title} onClick={() => setFocus({ side: 'a', n: p.n })}>
                    <div className="cursor-pointer p-2">
                      <StopDot side="a" n={p.n} big={isFocus('a', p.n)} onMap />
                    </div>
                  </AdvancedMarker>
                ))}
                {show !== 'a' && clipped.b.map(p => (
                  <AdvancedMarker key={`b${p.n}`} position={p} zIndex={isFocus('b', p.n) ? 40 : 20} title={p.title} onClick={() => setFocus({ side: 'b', n: p.n })}>
                    <div className="cursor-pointer p-2">
                      <StopDot side="b" n={p.n} eat={p.eat} big={isFocus('b', p.n)} onMap />
                    </div>
                  </AdvancedMarker>
                ))}
              </Map>
            </APIProvider>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
              <p className="flex flex-col items-center gap-2">
                <WifiOff className="size-5" aria-hidden="true" />
                Sin conexión no se puede cargar el mapa. El croquis del día sí funciona.
              </p>
            </div>
          )}

          {/* Leyenda */}
          <div className="bar-glass absolute left-3 top-3 flex flex-col gap-1 rounded-xl border border-border px-3 py-2 text-xs shadow-card">
            {show !== 'b' && <LegendLine side="a" />}
            {show !== 'a' && <LegendLine side="b" />}
            <span className="text-muted-foreground">Líneas rectas entre paradas</span>
          </div>
        </div>

        {/* Paradas: tocar una centra el mapa en ella */}
        {list.length > 0 && (
          <ol className="no-scrollbar -mx-6 flex shrink-0 gap-2 overflow-x-auto px-6" aria-label="Paradas">
            {list.map(p => {
              const active = isFocus(p.side, p.n)
              return (
                <li key={`${p.side}${p.n}`} className="shrink-0" data-tone={SIDE_TONE[p.side]}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocus({ side: p.side, n: p.n })}
                    className={cn(
                      'flex h-11 max-w-60 items-center gap-2 rounded-full border pl-2 pr-4 text-sm transition-colors',
                      active ? 'border-tone bg-tone-soft font-medium' : 'border-border-strong bg-card hover:bg-secondary',
                    )}
                  >
                    <StopDot side={p.side} n={p.n} eat={p.eat} />
                    <span className="truncate">{p.title}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Modal>
  )
}

/** El número de una parada: A en contorno, B rellena (las comidas, con su tono). */
export function StopDot({ side, n, eat, big, onMap }: { side: Side; n: number; eat?: boolean; big?: boolean; onMap?: boolean }) {
  return (
    <span
      data-tone={side === 'b' && eat ? 'restaurant' : SIDE_TONE[side]}
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums transition-transform',
        onMap ? 'size-7 shadow-raised' : 'size-6',
        side === 'b'
          ? cn('bg-tone text-white dark:text-background', onMap && 'border-2 border-card')
          : 'border-2 border-tone bg-card text-tone',
        big && 'scale-125',
      )}
    >
      {n}
    </span>
  )
}

export function LegendLine({ side, short }: { side: Side; short?: boolean }) {
  return (
    <span data-tone={SIDE_TONE[side]} className="flex items-center gap-2">
      <svg width="22" height="4" aria-hidden="true" className="stroke-tone">
        <line x1="0" y1="2" x2="22" y2="2" strokeWidth={side === 'a' ? 2.5 : 4} strokeDasharray={side === 'a' ? '4 3' : undefined} />
      </svg>
      {short ? side.toUpperCase() : `Versión ${side.toUpperCase()}`}
      <span className="sr-only">{side === 'a' ? '(línea discontinua)' : '(línea continua)'}</span>
    </span>
  )
}

// Encuadra todas las paradas. El mapa nace dentro de una ventana que aún se está
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
    // El último, cuando la ventana ya ha terminado de animarse.
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

function Line({ points, tone, dashed, hotel }: { points: GeoPoint[]; tone: Tone; dashed?: boolean; hotel?: GeoPoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || points.length === 0) return
    // Google pinta en canvas: necesita el color real del tema, no la variable.
    const color = toneHex(tone)
    const lines: google.maps.Polyline[] = []
    if (dashed) {
      lines.push(new google.maps.Polyline({
        map, path: points, strokeOpacity: 0, zIndex: 1,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, strokeWeight: 3.5, scale: 3 }, offset: '0', repeat: '14px' }],
      }))
    } else {
      // Borde blanco debajo para que se lea sobre cualquier fondo del mapa.
      lines.push(new google.maps.Polyline({ map, path: points, strokeColor: 'white', strokeOpacity: 0.9, strokeWeight: 8, zIndex: 2 }))
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
  }, [map, points, tone, dashed, hotel])
  return null
}
