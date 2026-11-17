import { useMemo } from 'react'
import type { GeoPoint } from '@/lib/travelTime'
import { nearMedian, type SketchPoint } from '@/lib/versions/sketch'
import { SIDE_TONE } from './versionStyle'

// Croquis de la ruta de un día: las dos versiones superpuestas, A discontinua y
// B continua y numerada. Es un SVG hecho a mano a propósito: no gasta la API de
// Maps (ni la cuota de Geocoding), funciona sin conexión y se pinta al instante
// aunque haya veinte días en pantalla.

interface Props {
  a?: SketchPoint[]
  b: SketchPoint[]
  hotel?: GeoPoint | null
  /** Etiqueta accesible. */
  label: string
}

const W = 320, H = 220, PAD = 22

export function RouteSketch({ a = [], b, hotel, label }: Props) {
  const geo = useMemo(() => {
    if (a.length + b.length === 0) return null
    const near = nearMedian([...a, ...b])
    const A = a.filter(near), B = b.filter(near)
    const H0 = hotel && near(hotel) ? hotel : null
    const pts = [...A, ...B, ...(H0 ? [H0] : [])]
    if (pts.length === 0) return null

    const la0 = Math.min(...pts.map(p => p.lat)), la1 = Math.max(...pts.map(p => p.lat))
    const lo0 = Math.min(...pts.map(p => p.lng)), lo1 = Math.max(...pts.map(p => p.lng))
    const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180)
    const sx = Math.max((lo1 - lo0) * k, 0.002), sy = Math.max(la1 - la0, 0.002)
    const sc = Math.min((W - 2 * PAD) / sx, (H - 2 * PAD) / sy)
    const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2
    const P = (p: GeoPoint) => ({
      x: W / 2 + (p.lng - cx) * k * sc,
      y: H / 2 - (p.lat - cy) * sc,
    })

    // Barra de escala: el primer valor redondo que mida al menos 40 px.
    const kmPerPx = 1 / (sc / 111.32)
    const barKm = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find(v => v / kmPerPx >= 40) ?? 20
    const hidden = a.length + b.length - A.length - B.length

    return { A: A.map(p => ({ ...p, ...P(p) })), B: B.map(p => ({ ...p, ...P(p) })), hotel: H0 && P(H0), barKm, barPx: barKm / kmPerPx, hidden }
  }, [a, b, hotel])

  if (!geo) {
    return (
      <div className="grid aspect-[320/220] place-items-center rounded-xl bg-sunken px-6 text-center text-xs text-muted-foreground">
        Este día no tiene ningún sitio con ubicación.
      </div>
    )
  }

  const line = (ps: { x: number; y: number }[]) => ps.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const linkHotel = (ps: { x: number; y: number }[]) =>
    geo.hotel && ps.length ? [`${geo.hotel.x},${geo.hotel.y} ${ps[0].x},${ps[0].y}`, `${ps[ps.length - 1].x},${ps[ps.length - 1].y} ${geo.hotel.x},${geo.hotel.y}`] : []

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full rounded-xl bg-sunken">
        <g className="stroke-border" strokeWidth={0.6}>
          {[1, 2, 3, 4, 5].map(i => <line key={`v${i}`} x1={(W * i) / 6} y1={0} x2={(W * i) / 6} y2={H} />)}
          {[1, 2, 3].map(i => <line key={`h${i}`} x1={0} y1={(H * i) / 4} x2={W} y2={(H * i) / 4} />)}
        </g>

        {/* A: referencia, discontinua y sin números */}
        {geo.A.length > 0 && (
          <g data-tone={SIDE_TONE.a} className="stroke-tone" fill="none">
            {linkHotel(geo.A).map((pts, i) => <polyline key={i} points={pts} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="2 4" />)}
            <polyline points={line(geo.A)} strokeOpacity={0.75} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" />
            {geo.A.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} className="fill-card" strokeWidth={2} />)}
          </g>
        )}

        {/* B: la candidata, continua y numerada */}
        <g className="stroke-muted-foreground" fill="none" strokeWidth={1.2} strokeDasharray="3 4">
          {linkHotel(geo.B).map((pts, i) => <polyline key={i} points={pts} />)}
        </g>
        <polyline data-tone={SIDE_TONE.b} className="stroke-tone" points={line(geo.B)} fill="none" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {geo.hotel && (
          <g>
            <rect x={geo.hotel.x - 9} y={geo.hotel.y - 9} width={18} height={18} rx={5} className="fill-foreground stroke-card" strokeWidth={2} />
            <text x={geo.hotel.x} y={geo.hotel.y + 4} textAnchor="middle" fontSize={10.5} fontWeight={600} className="fill-card">H</text>
          </g>
        )}
        {geo.B.map(p => (
          <g key={p.n} data-tone={p.eat ? 'restaurant' : SIDE_TONE.b}>
            <circle cx={p.x} cy={p.y} r={10} className="fill-tone stroke-card" strokeWidth={2} />
            <text x={p.x} y={p.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={600} className="fill-white tabular-nums dark:fill-background">{p.n}</text>
          </g>
        ))}

        <line x1={14} y1={H - 14} x2={14 + geo.barPx} y2={H - 14} className="stroke-foreground" strokeWidth={2} />
        <text x={20 + geo.barPx} y={H - 10.5} fontSize={10} className="fill-muted-foreground">{geo.barKm} km</text>
      </svg>
      {geo.hidden > 0 && (
        <figcaption className="mt-1 text-2xs text-muted-foreground">
          {geo.hidden === 1 ? '1 parada queda' : `${geo.hidden} paradas quedan`} fuera del croquis (otra ciudad).
        </figcaption>
      )}
    </figure>
  )
}
