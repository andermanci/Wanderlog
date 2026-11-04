import { useMemo } from 'react'
import { haversineKm, type GeoPoint } from '@/lib/travelTime'
import { SIDE } from './versionStyle'

// Croquis de la ruta de un día: las dos versiones superpuestas, A discontinua y
// B continua y numerada. Es un SVG hecho a mano a propósito: no gasta la API de
// Maps (ni la cuota de Geocoding), funciona sin conexión y se pinta al instante
// aunque haya veinte días en pantalla.

export interface SketchPoint extends GeoPoint {
  n: number
  eat?: boolean
}

interface Props {
  a?: SketchPoint[]
  b: SketchPoint[]
  hotel?: GeoPoint | null
  /** Etiqueta accesible. */
  label: string
}

const W = 320, H = 220, PAD = 22
/** Lo que queda a más de esto de la mediana es otra ciudad (el tren del día): fuera del croquis. */
const CLIP_KM = 40

export function RouteSketch({ a = [], b, hotel, label }: Props) {
  const geo = useMemo(() => {
    const all = [...a, ...b]
    if (all.length === 0) return null
    const lats = all.map(p => p.lat).sort((x, y) => x - y)
    const lngs = all.map(p => p.lng).sort((x, y) => x - y)
    const med = { lat: lats[lats.length >> 1], lng: lngs[lngs.length >> 1] }
    const near = (p: GeoPoint) => haversineKm(p, med) < CLIP_KM
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
      <div className="rounded-xl grid place-items-center text-xs text-muted-foreground text-center px-6"
        style={{ aspectRatio: `${W} / ${H}`, background: 'var(--secondary)' }}>
        Sin ubicaciones este día
      </div>
    )
  }

  const line = (ps: { x: number; y: number }[]) => ps.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const linkHotel = (ps: { x: number; y: number }[]) =>
    geo.hotel && ps.length ? [`${geo.hotel.x},${geo.hotel.y} ${ps[0].x},${ps[0].y}`, `${ps[ps.length - 1].x},${ps[ps.length - 1].y} ${geo.hotel.x},${geo.hotel.y}`] : []

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-auto block rounded-xl"
        style={{ background: 'color-mix(in srgb, var(--secondary) 70%, var(--card))' }}>
        {[1, 2, 3, 4, 5].map(i => <line key={`v${i}`} x1={(W * i) / 6} y1={0} x2={(W * i) / 6} y2={H} stroke="var(--border)" strokeWidth={0.6} />)}
        {[1, 2, 3].map(i => <line key={`h${i}`} x1={0} y1={(H * i) / 4} x2={W} y2={(H * i) / 4} stroke="var(--border)" strokeWidth={0.6} />)}

        {/* A: referencia, discontinua y sin números */}
        {geo.A.length > 0 && (
          <g>
            {linkHotel(geo.A).map((pts, i) => <polyline key={i} points={pts} fill="none" stroke={SIDE.a.color} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="2 4" />)}
            <polyline points={line(geo.A)} fill="none" stroke={SIDE.a.color} strokeOpacity={0.75} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" />
            {geo.A.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--card)" stroke={SIDE.a.color} strokeWidth={2} />)}
          </g>
        )}

        {/* B: la candidata, continua y numerada */}
        {linkHotel(geo.B).map((pts, i) => <polyline key={i} points={pts} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} strokeDasharray="3 4" />)}
        <polyline points={line(geo.B)} fill="none" stroke={SIDE.b.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {geo.hotel && (
          <g>
            <rect x={geo.hotel.x - 9} y={geo.hotel.y - 9} width={18} height={18} rx={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
            <text x={geo.hotel.x} y={geo.hotel.y + 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--card)">H</text>
          </g>
        )}
        {geo.B.map(p => (
          <g key={p.n}>
            <circle cx={p.x} cy={p.y} r={10} fill={p.eat ? 'var(--chart-5)' : SIDE.b.color} stroke="var(--card)" strokeWidth={2} />
            <text x={p.x} y={p.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--primary-foreground)"
              style={{ fontVariantNumeric: 'tabular-nums' }}>{p.n}</text>
          </g>
        ))}

        <line x1={14} y1={H - 14} x2={14 + geo.barPx} y2={H - 14} stroke="var(--foreground)" strokeWidth={2} />
        <text x={20 + geo.barPx} y={H - 10.5} fontSize={10} fill="var(--muted-foreground)">{geo.barKm} km</text>
      </svg>
      {geo.hidden > 0 && (
        <figcaption className="text-[11px] text-muted-foreground mt-1">
          {geo.hidden === 1 ? '1 parada queda' : `${geo.hidden} paradas quedan`} fuera del croquis (otra ciudad).
        </figcaption>
      )}
    </figure>
  )
}
