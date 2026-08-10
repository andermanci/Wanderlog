import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  ComposedChart, Bar, Line, CartesianGrid,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AdminHeader, Dato, TablaSkeleton } from '@/components/admin/AdminShell'
import { TablaBarras } from '@/components/admin/TablaBarras'
import { useAdminAnalytics, useUltimaVista } from '@/lib/queries/admin'
import { formatDate } from '@/lib/utils'
import type { Resumen } from '@/lib/analytics/aggregate'

const VENTANAS = [7, 30, 90]

/** Milisegundos a algo legible. Por debajo del minuto, segundos enteros. */
function duracion(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return `${m} min ${String(s % 60).padStart(2, '0')} s`
}

/** Horas desde una fecha ISO. Sirve para la alarma de «ha dejado de grabar». */
function horasDesde(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

export function AdminVisitsPage() {
  const [dias, setDias] = useState(30)
  const [diaAbierto, setDiaAbierto] = useState<Resumen['porDia'][number] | null>(null)
  const { data, isLoading, isError, error } = useAdminAnalytics(dias)
  // Va por Supabase, no por la edge function: sigue contestando aunque la
  // analítica esté caída, que es cuando de verdad quieres saber esto.
  const { data: ultima } = useUltimaVista()

  const sinDesplegar = (error as Error | null)?.message === 'ENDPOINT_NO_DESPLEGADO'
  const horasSinVistas = horasDesde(ultima ?? null)

  return (
    <div>
      <AdminHeader
        titulo="Visitas"
        subtitulo="Sin cookies y sin guardar la IP. Los datos se borran solos a los 90 días."
      >
        <div className="flex gap-1">
          {VENTANAS.map(d => (
            <Button
              key={d}
              size="sm"
              variant={d === dias ? 'brand' : 'outline'}
              onClick={() => setDias(d)}
            >
              {d} días
            </Button>
          ))}
        </div>
      </AdminHeader>

      {isError ? (
        <Aviso>
          {sinDesplegar
            ? 'Las edge functions de analítica todavía no están desplegadas: hasta entonces no se registra ninguna visita. En local es lo normal (Vite no las sirve). En producción, comprueba que Netlify tiene declaradas SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY con el scope «Functions», y que curl https://…/api/track devuelve {"ok":true,"v":1} y no HTML.'
            : `No se pudieron leer las visitas: ${(error as Error)?.message ?? 'error desconocido'}`}
          {' '}
          {ultima
            ? `La última visita registrada es de hace ${Math.round(horasSinVistas ?? 0)} h.`
            : 'No hay ninguna visita registrada todavía.'}
        </Aviso>
      ) : isLoading || !data ? (
        <TablaSkeleton filas={3} />
      ) : (
        <Contenido data={data} onDia={setDiaAbierto} />
      )}

      <ModalHoras dia={diaAbierto} media={data?.horaMedia ?? []} onClose={() => setDiaAbierto(null)} />
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-4 rounded-xl surface"
      style={{ borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' }}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden="true" />
      <p className="text-sm">{children}</p>
    </div>
  )
}

function Contenido({ data, onDia }: {
  data: Resumen
  onDia: (d: Resumen['porDia'][number]) => void
}) {
  const horas = horasDesde(data.ultimaVista)
  const pctConDuracion = data.vistas ? Math.round((data.conDuracion / data.vistas) * 100) : 0

  return (
    <>
      {data.truncado && (
        <div className="mb-4">
          <Aviso>
            Se alcanzó el límite de 50.000 visitas al leer: <strong>las cifras de abajo
            se quedan cortas</strong>. Toca pasar a un acumulado diario en Postgres.
          </Aviso>
        </div>
      )}

      {/* La alarma que de verdad se mira. El endpoint responde 204 pase lo que
          pase, así que si deja de grabar no hay ningún error en ningún sitio:
          solo se nota porque esta fecha se queda quieta. */}
      {horas != null && horas > 6 && (
        <div className="mb-4">
          <Aviso>
            La última visita registrada fue hace {Math.round(horas)} horas. Si la web
            tiene tráfico, es que la analítica ha dejado de grabar: comprueba{' '}
            <code className="text-xs">curl https://…/api/track</code>, que debe
            devolver <code className="text-xs">{'{"ok":true,"v":1}'}</code> y no HTML.
          </Aviso>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Dato valor={data.vistas} etiqueta="Vistas"
          sub={data.ultimaVista ? `última hace ${horas != null && horas < 1 ? 'menos de 1 h' : `${Math.round(horas ?? 0)} h`}` : 'ninguna todavía'} />
        <Dato valor={data.sesiones} etiqueta="Sesiones"
          sub={`${data.identificadas.conSesion} con sesión iniciada`} />
        <Dato valor={data.vistasPorSesion} etiqueta="Vistas por sesión"
          sub={`${data.unaSolaVista} se quedaron en una`} />
        <Dato valor={duracion(data.medianaMs)} etiqueta="Mediana en pantalla"
          sub={`sobre el ${pctConDuracion} % con dato · media ${duracion(data.mediaMs)}`} />
      </div>

      {data.porDia.length > 0 && (
        <section className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Por día
          </h3>
          <div className="p-4 rounded-xl surface">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={data.porDia}
                margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                onClick={(estado) => {
                  // Recharts tipa este callback como un evento de ratón, pero
                  // lo que pasa es el estado del gráfico: de ahí el cast.
                  const i = (estado as unknown as { activeTooltipIndex?: number })?.activeTooltipIndex
                  if (typeof i === 'number' && data.porDia[i]) onDia(data.porDia[i])
                }}
              >
                <defs>
                  <linearGradient id="gradVisitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="dia" tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(d: string) => formatDate(d, 'd MMM')}
                  minTickGap={24}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 12, fontSize: 12,
                  }}
                  labelFormatter={(d: unknown) => formatDate(String(d), "EEEE d 'de' MMMM")}
                  formatter={(v: unknown) => [Number(v), 'sesiones']}
                />
                <Area type="monotone" dataKey="sesiones" stroke="var(--primary)"
                  strokeWidth={2} fill="url(#gradVisitas)" />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              Pulsa un día para ver a qué horas fue.
            </p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <TablaBarras
          titulo="Secciones más vistas" filas={data.secciones} total={data.sesiones}
          formatear={c => `${c.vistas} vistas · ${duracion(c.medianaMs)}`}
          pie={`De ${data.vistas - data.conDuracion} vistas no se conoce el tiempo: el aviso de cierre no llegó.`}
        />
        <TablaBarras
          titulo="De dónde vienen" filas={data.procedencia} total={data.sesiones}
          pie="«directo» incluye los enlaces abiertos desde WhatsApp, que es como se comparte un viaje."
        />
        <TablaBarras
          titulo="Dispositivos" filas={data.dispositivos} total={data.sesiones}
          pie="«pwa» es quien tiene Wanderlog instalado como aplicación."
        />
        <TablaBarras
          titulo="Países" filas={data.paises} total={data.sesiones}
          pie="Sale del CDN. No se guarda la IP, ni entera ni recortada."
        />
        <TablaBarras
          titulo="Regiones" filas={data.regiones} total={data.sesiones}
          pie="Se para en la región a propósito: la ciudad señalaría a personas concretas."
        />
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Son <strong>sesiones, no usuarios</strong>: el identificador vive en la pestaña
        y muere al cerrarla, así que quien vuelve mañana cuenta dos veces.
        «Una sola vista» no significa que no le interesara.
        Las visitas se guardan 90 días y luego se borran solas.
      </p>
    </>
  )
}

// Un día suelto no dice nada sin saber cómo es un día normal: con solo las
// barras, cualquier hora punta parece un hallazgo. De ahí la línea punteada
// con la media del periodo.
function ModalHoras({ dia, media, onClose }: {
  dia: Resumen['porDia'][number] | null
  media: number[]
  onClose: () => void
}) {
  if (!dia) return null
  const datos = dia.horas.map((v, h) => ({ hora: `${String(h).padStart(2, '0')}h`, vistas: v, media: media[h] ?? 0 }))
  const punta = dia.horas.indexOf(Math.max(...dia.horas))

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="surface max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {formatDate(dia.dia, "EEEE d 'de' MMMM")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          {dia.vistas} vistas · {dia.sesiones} sesiones · hora punta a las{' '}
          {String(punta).padStart(2, '0')}:00
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="hora" tickLine={false} axisLine={false} minTickGap={16}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
            <YAxis tickLine={false} axisLine={false} width={28}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, fontSize: 12,
              }}
            />
            <Bar dataKey="vistas" fill="var(--primary)" radius={[3, 3, 0, 0]} name="Vistas" />
            <Line type="monotone" dataKey="media" stroke="var(--muted-foreground)"
              strokeDasharray="4 3" dot={false} strokeWidth={1.5} name="Media del periodo" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground">
          La línea punteada es la media por hora de todo el periodo, para poder
          juzgar si este día fue normal.
        </p>
      </DialogContent>
    </Dialog>
  )
}
