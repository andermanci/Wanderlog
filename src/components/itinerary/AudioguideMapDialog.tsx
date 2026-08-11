import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, ColorScheme, Map } from '@vis.gl/react-google-maps'
import { Headphones, LocateFixed, Loader2, Navigation } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DirectionsDialog } from '@/components/DirectionsDialog'
import type { DirectionsTarget } from '@/lib/directions'
import { useMyLocation } from '@/hooks/useMyLocation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { stopPoint } from '@/lib/queries/audioguideStopLocations'
import { cn } from '@/lib/utils'
import type { AudioguideStop } from '@/types/database'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Todas las paradas de la audioguía, en orden (las de interior incluidas). */
  stops: AudioguideStop[]
  /** Índice, dentro de `stops`, de la parada que suena. */
  activeIndex: number
  /** Índice de la parada sobre la que centrar al abrir. */
  focusIndex: number
  /** Saltar a esa parada en el reproductor (y cerrar el mapa). */
  onSelectStop: (index: number) => void
}

// Mapa de las paradas de la audioguía, en un diálogo sobre el reproductor: el
// audio no se toca (el <audio> vive en el reproductor, que sigue montado) y se
// vuelve cerrando el diálogo. Útil cuando la audioguía recorre una zona
// extensa y no basta con el "gira a la izquierda" de cada parada.
export function AudioguideMapDialog({
  open, onOpenChange, stops, activeIndex, focusIndex, onSelectStop,
}: Props) {
  const online = useOnlineStatus()
  const [map, setMap] = useState<google.maps.Map | null>(null)
  // Parada elegida tocando un pin. Mientras sea null manda la parada con la
  // que se abrió el mapa; así no hace falta sincronizar estado con la prop.
  const [pinElegido, setPinElegido] = useState<number | null>(null)
  const selected = pinElegido ?? focusIndex
  const [directionsTarget, setDirectionsTarget] = useState<DirectionsTarget | null>(null)

  // Paradas que se pueden pintar, conservando su número real en la audioguía.
  const located = useMemo(
    () => stops.map((stop, index) => ({ stop, index, point: stopPoint(stop) }))
      .filter((s): s is { stop: AudioguideStop; index: number; point: google.maps.LatLngLiteral } => !!s.point),
    [stops],
  )
  const unlocated = useMemo(() => stops.filter(s => !stopPoint(s)), [stops])

  const myLocation = useMyLocation((pos, first) => {
    if (first) { map?.panTo(pos); map?.setZoom(16) }
  })

  // Cerrar suelta el watch de geolocalización (el diálogo se desmonta, pero
  // este componente no) y olvida el pin elegido.
  const cerrar = () => {
    myLocation.stop()
    setPinElegido(null)
    onOpenChange(false)
  }

  // Encuadre inicial sobre todas las paradas. Google cachea el tamaño del
  // contenedor al inicializarse y aquí nace dentro de un diálogo que aún se
  // está animando: sin el empujón de resize el mapa sale encogido.
  useEffect(() => {
    if (!map || !open || located.length === 0) return
    const encuadrar = () => {
      google.maps.event.trigger(map, 'resize')
      const bounds = new google.maps.LatLngBounds()
      located.forEach(s => bounds.extend(s.point))
      // Más hueco arriba y a la derecha: ahí flota el botón de ubicación, y el
      // pin cuelga del punto, así que sin margen se corta por el borde.
      map.fitBounds(bounds, { top: 72, right: 72, bottom: 48, left: 48 })
      // Una sola parada visible dejaría un zoom absurdo de nivel calle-a-calle.
      if (located.length === 1) map.setZoom(16)
    }
    const t1 = setTimeout(encuadrar, 80)
    const t2 = setTimeout(encuadrar, 400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [map, open, located])

  // Si la parada que suena es de las que no tienen sitio propio, la tarjeta
  // arranca en la primera localizada en vez de quedarse vacía.
  const seleccionada = located.find(s => s.index === selected)
    ?? located.find(s => s.index === activeIndex)
    ?? located[0]
  const centro = located[0]?.point ?? { lat: 0, lng: 0 }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (o) onOpenChange(true); else cerrar() }}>
        <DialogContent className="surface sm:max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 pr-12 border-b border-border">
            <DialogTitle className="font-serif text-base flex items-center gap-2">
              <Navigation size={16} style={{ color: 'var(--primary)' }} />
              Paradas en el mapa
            </DialogTitle>
          </DialogHeader>

          {online ? (
            <div className="relative h-[60dvh]">
              <Map
                defaultCenter={centro}
                defaultZoom={14}
                mapId="wanderlog-map"
                onIdle={(e) => setMap(e.map)}
                colorScheme={ColorScheme.FOLLOW_SYSTEM}
                gestureHandling="greedy"
                disableDefaultUI
                className="w-full h-full"
              >
                {located.map(({ stop, index, point }) => {
                  const sonando = index === activeIndex
                  const elegida = index === selected
                  return (
                    <AdvancedMarker
                      key={stop.id}
                      position={point}
                      zIndex={sonando ? 15 : elegida ? 10 : 5}
                      onClick={() => setPinElegido(index)}
                    >
                      {/* El icono mide 24px pero el área pulsable ronda los 44px. */}
                      <div className="p-2.5 cursor-pointer" title={stop.title}>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg text-[11px] font-bold text-white transition-transform',
                            (sonando || elegida) && 'scale-125 ring-2 ring-white',
                          )}
                          style={{ background: sonando ? '#bf4d22' : '#e0815a' }}
                        >
                          {index + 1}
                        </div>
                      </div>
                    </AdvancedMarker>
                  )
                })}

                {/* Mi ubicación */}
                {myLocation.pos && (
                  <AdvancedMarker position={myLocation.pos} zIndex={20}>
                    <div className="relative">
                      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(59,130,246,0.4)' }} />
                      <span className="block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: '#3b82f6' }} />
                    </div>
                  </AdvancedMarker>
                )}
              </Map>

              <Button
                size="icon"
                onClick={myLocation.toggle}
                aria-label="Ver mi ubicación"
                title="Ver mi ubicación"
                aria-pressed={myLocation.following}
                className="absolute top-3 right-3 z-10 rounded-full w-11 h-11 shadow-xl"
                style={myLocation.following
                  ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                  : { background: 'var(--card)', color: 'var(--primary)', border: '1px solid var(--border)' }}
              >
                {myLocation.locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
              </Button>
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Sin conexión no se puede cargar el mapa. Puedes abrir cualquier parada en tu app
              de mapas con «Cómo llegar».
            </div>
          )}

          <div className="px-4 py-3 border-t border-border space-y-2 max-h-[28dvh] overflow-y-auto">
            {seleccionada ? (
              <>
                <p className="text-sm font-medium">{seleccionada.index + 1}. {seleccionada.stop.title}</p>
                {seleccionada.stop.summary && (
                  <p className="text-xs text-muted-foreground">{seleccionada.stop.summary}</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { onSelectStop(seleccionada.index); cerrar() }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-md text-white"
                    style={{ background: 'var(--primary)' }}
                  >
                    <Headphones size={15} />
                    {seleccionada.index === activeIndex ? 'Volver al audio' : 'Escuchar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionsTarget({
                      name: seleccionada.stop.place_query || seleccionada.stop.title,
                      lat: seleccionada.stop.lat,
                      lng: seleccionada.stop.lng,
                    })}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-md border border-border"
                  >
                    <Navigation size={15} /> Cómo llegar
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Toca un número del mapa para ver esa parada.</p>
            )}

            {/* Las paradas sin sitio propio (salas de un mismo edificio, o
                títulos que no son un lugar) se dicen, no se esconden. */}
            {unlocated.length > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {unlocated.length === 1
                  ? '1 parada sin ubicación: '
                  : `${unlocated.length} paradas sin ubicación: `}
                {unlocated.map(s => s.title).join(' · ')}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DirectionsDialog target={directionsTarget} onClose={() => setDirectionsTarget(null)} />
    </>
  )
}
