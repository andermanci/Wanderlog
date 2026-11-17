import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, ColorScheme, Map } from '@vis.gl/react-google-maps'
import { ArrowLeft, ExternalLink, Headphones, LocateFixed, Navigation, WifiOff } from 'lucide-react'
import { Button, Empty, Modal, Spinner } from '@/design'
import { navAppsFor } from '@/lib/directions'
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

// Mapa de las paradas de la audioguía, en una ventana sobre el reproductor: el
// audio no se toca (los <audio> viven fuera de la pantalla) y se vuelve
// cerrando la ventana. Útil cuando la audioguía recorre una zona extensa y no
// basta con el «gira a la izquierda» de cada parada.
export function StopsMapModal({ open, onOpenChange, stops, activeIndex, focusIndex, onSelectStop }: Props) {
  const online = useOnlineStatus()
  const [map, setMap] = useState<google.maps.Map | null>(null)
  // Parada elegida tocando un pin. Mientras sea null manda la parada con la
  // que se abrió el mapa; así no hace falta sincronizar estado con la prop.
  const [pinElegido, setPinElegido] = useState<number | null>(null)
  const selected = pinElegido ?? focusIndex
  // «Cómo llegar» no abre otra ventana encima: cambia el pie de esta.
  const [eligiendoApp, setEligiendoApp] = useState(false)

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

  // Cerrar suelta el watch de geolocalización (la ventana se desmonta, pero
  // este componente no) y olvida el pin elegido.
  const cerrar = () => {
    myLocation.stop()
    setPinElegido(null)
    setEligiendoApp(false)
    onOpenChange(false)
  }

  // Encuadre inicial sobre todas las paradas. Google cachea el tamaño del
  // contenedor al inicializarse y aquí nace dentro de una ventana que aún se
  // está animando: sin el empujón de resize el mapa sale encogido.
  useEffect(() => {
    if (!map || !open || located.length === 0) return
    const encuadrar = () => {
      google.maps.event.trigger(map, 'resize')
      const bounds = new google.maps.LatLngBounds()
      located.forEach(s => bounds.extend(s.point))
      // Más hueco arriba: ahí flotan el botón de ubicación y el de cerrar, y el
      // pin cuelga del punto, así que sin margen se corta por el borde.
      map.fitBounds(bounds, { top: 80, right: 56, bottom: 48, left: 56 })
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
  const apps = seleccionada
    ? navAppsFor({
        name: seleccionada.stop.place_query || seleccionada.stop.title,
        lat: seleccionada.stop.lat,
        lng: seleccionada.stop.lng,
      })
    : []

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (o) onOpenChange(true); else cerrar() }}
      title="Paradas en el mapa"
      hideTitle
      size="full"
      className="overflow-hidden"
    >
      <div className="flex h-full flex-col">
        {online ? (
          <div className="relative min-h-0 flex-1">
            <Map
              defaultCenter={centro}
              defaultZoom={14}
              mapId="wanderlog-map"
              onIdle={(e) => setMap(e.map)}
              colorScheme={ColorScheme.FOLLOW_SYSTEM}
              gestureHandling="greedy"
              disableDefaultUI
              className="h-full w-full"
            >
              {located.map(({ stop, index, point }) => {
                const sonando = index === activeIndex
                const elegida = index === selected
                return (
                  <AdvancedMarker
                    key={stop.id}
                    position={point}
                    zIndex={sonando ? 15 : elegida ? 10 : 5}
                    onClick={() => { setPinElegido(index); setEligiendoApp(false) }}
                  >
                    {/* El número mide 28px pero el área pulsable ronda los 44px. */}
                    <div className="cursor-pointer p-2" title={stop.title}>
                      <div
                        className={cn(
                          'grid size-7 place-items-center rounded-full border-2 text-xs font-bold shadow-raised transition-transform',
                          sonando
                            ? 'border-primary-foreground bg-primary text-primary-foreground'
                            : 'border-primary bg-card text-foreground',
                          (sonando || elegida) && 'scale-125',
                        )}
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
                  <div data-tone="info" className="relative" title="Estás aquí">
                    <span className="absolute inset-0 animate-ping rounded-full bg-tone opacity-40" />
                    <span className="relative block size-4 rounded-full border-2 border-card bg-tone shadow-card" />
                  </div>
                </AdvancedMarker>
              )}
            </Map>

            <Button
              size="md"
              variant={myLocation.following ? 'primary' : 'outline'}
              aria-pressed={myLocation.following}
              onClick={myLocation.toggle}
              className="absolute left-3 top-3 z-10 shadow-raised"
            >
              {myLocation.locating ? <Spinner className="size-4 text-current" label="Buscándote" /> : <LocateFixed />}
              Mi ubicación
            </Button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-6">
            <Empty
              bare icon={WifiOff} title="Sin conexión no hay mapa"
              description="Aun así puedes abrir cualquier parada en tu app de mapas con «Cómo llegar»."
            />
          </div>
        )}

        <div className="max-h-[38dvh] shrink-0 space-y-3 overflow-y-auto border-t border-border px-5 py-4">
          {!seleccionada ? (
            <p className="text-sm text-muted-foreground">Toca un número del mapa para ver esa parada.</p>
          ) : eligiendoApp ? (
            <>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEligiendoApp(false)}>
                  <ArrowLeft /> Volver
                </Button>
                <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  Cómo llegar a {seleccionada.stop.title}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {apps.map(app => (
                  <Button key={app.name} variant="outline" block asChild>
                    <a href={app.href} target="_blank" rel="noreferrer" onClick={() => setEligiendoApp(false)}>
                      {app.name} <ExternalLink />
                    </a>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Se abre la app si la tienes instalada; si no, en el navegador.</p>
            </>
          ) : (
            <>
              <div>
                <p className="eyebrow">
                  Parada {seleccionada.index + 1}{seleccionada.index === activeIndex ? ' · sonando' : ''}
                </p>
                <p className="title-card">{seleccionada.stop.title}</p>
                {seleccionada.stop.summary && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{seleccionada.stop.summary}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" block onClick={() => { onSelectStop(seleccionada.index); cerrar() }}>
                  <Headphones /> {seleccionada.index === activeIndex ? 'Volver al audio' : 'Escuchar'}
                </Button>
                <Button variant="outline" block onClick={() => setEligiendoApp(true)}>
                  <Navigation /> Cómo llegar
                </Button>
              </div>
            </>
          )}

          {/* Las paradas sin sitio propio (salas de un mismo edificio, o
              títulos que no son un lugar) se dicen, no se esconden. */}
          {unlocated.length > 0 && !eligiendoApp && (
            <p className="text-xs text-muted-foreground">
              {unlocated.length === 1
                ? '1 parada sin ubicación: '
                : `${unlocated.length} paradas sin ubicación: `}
              {unlocated.map(s => s.title).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
