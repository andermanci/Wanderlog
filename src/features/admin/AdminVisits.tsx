import { useId, useState, type ReactNode } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  ComposedChart, Bar, Line, CartesianGrid,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { Card, Modal, Notice, Page, Section, Segmented, Stack } from '@/design'
import { useAdminAnalytics, useUltimaVista } from '@/lib/queries/admin'
import { formatDate } from '@/lib/utils'
import type { Resumen } from '@/lib/analytics/aggregate'
import { Dato, Datos, TablaSkeleton } from './piezas'
import { estiloTooltip, useColoresGrafico } from './colores'
import { TablaBarras } from './TablaBarras'

const VENTANAS = ['7', '30', '90'].map(d => ({ value: d, label: `${d} días` }))

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

type Dia = Resumen['porDia'][number]

export function AdminVisitsPage() {
  const [dias, setDias] = useState(30)
  const [diaAbierto, setDiaAbierto] = useState<Dia | null>(null)
  const { data, isLoading, isError, error } = useAdminAnalytics(dias)
  // Va por Supabase, no por la edge function: sigue contestando aunque la
  // analítica esté caída, que es cuando de verdad quieres saber esto.
  const { data: ultima } = useUltimaVista()

  const sinDesplegar = (error as Error | null)?.message === 'ENDPOINT_NO_DESPLEGADO'
  const horasSinVistas = horasDesde(ultima ?? null)

  return (
    <Page
      title="Visitas"
      subtitle="Sin cookies y sin guardar la IP. Los datos se borran solos a los 90 días."
      actions={
        <Segmented label="Periodo" size="sm" value={String(dias)} onChange={v => setDias(Number(v))} options={VENTANAS} />
      }
      width="wide"
    >
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
    </Page>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return <Notice tone="danger" icon={AlertTriangle}>{children}</Notice>
}

function Contenido({ data, onDia }: { data: Resumen; onDia: (d: Dia) => void }) {
  const c = useColoresGrafico()
  const gradiente = useId()
  const horas = horasDesde(data.ultimaVista)
  const pctConDuracion = data.vistas ? Math.round((data.conDuracion / data.vistas) * 100) : 0

  return (
    <Stack>
      {data.truncado && (
        <Aviso>
          Se alcanzó el límite de 50.000 visitas al leer: <strong>las cifras de abajo
          se quedan cortas</strong>. Toca pasar a un acumulado diario en Postgres.
        </Aviso>
      )}

      {/* La alarma que de verdad se mira. El endpoint responde 204 pase lo que
          pase, así que si deja de grabar no hay ningún error en ningún sitio:
          solo se nota porque esta fecha se queda quieta. */}
      {horas != null && horas > 6 && (
        <Aviso>
          La última visita registrada fue hace {Math.round(horas)} horas. Si la web
          tiene tráfico, es que la analítica ha dejado de grabar: comprueba{' '}
          <code className="font-mono text-xs">curl https://…/api/track</code>, que debe
          devolver <code className="font-mono text-xs">{'{"ok":true,"v":1}'}</code> y no HTML.
        </Aviso>
      )}

      <Datos>
        <Dato valor={data.vistas} etiqueta="Vistas"
          sub={data.ultimaVista ? `última hace ${horas != null && horas < 1 ? 'menos de 1 h' : `${Math.round(horas ?? 0)} h`}` : 'ninguna todavía'} />
        <Dato valor={data.sesiones} etiqueta="Sesiones"
          sub={`${data.identificadas.conSesion} con sesión iniciada`} />
        <Dato valor={data.vistasPorSesion} etiqueta="Vistas por sesión"
          sub={`${data.unaSolaVista} se quedaron en una`} />
        <Dato valor={duracion(data.medianaMs)} etiqueta="Mediana en pantalla"
          sub={`sobre el ${pctConDuracion} % con dato · media ${duracion(data.mediaMs)}`} />
      </Datos>

      {data.porDia.length > 0 && (
        <Section title="Por día">
          <Card>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={data.porDia}
                margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                onClick={(estado) => {
                  // Recharts tipa este callback como un evento de ratón, pero
                  // lo que pasa es el estado del gráfico: de ahí el cast.
                  const i = Number((estado as unknown as { activeTooltipIndex?: number | string | null })?.activeTooltipIndex ?? NaN)
                  if (Number.isInteger(i) && data.porDia[i]) onDia(data.porDia[i])
                }}
              >
                <defs>
                  <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.serie} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.serie} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="dia" tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: c.apoyo }}
                  tickFormatter={(d: string) => formatDate(d, 'd MMM')}
                  minTickGap={24}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={estiloTooltip(c)}
                  labelFormatter={(d: unknown) => formatDate(String(d), "EEEE d 'de' MMMM")}
                  formatter={(v: unknown) => [Number(v), 'sesiones']}
                />
                <Area type="monotone" dataKey="sesiones" stroke={c.serie} strokeWidth={2} fill={`url(#${gradiente})`} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-muted-foreground">Pulsa un día para ver a qué horas fue.</p>
          </Card>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TablaBarras
          titulo="Secciones más vistas" filas={data.secciones} total={data.sesiones}
          formatear={s => `${s.vistas} vistas · ${duracion(s.medianaMs)}`}
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

      <p className="text-xs text-muted-foreground">
        Son <strong>sesiones, no usuarios</strong>: el identificador vive en la pestaña
        y muere al cerrarla, así que quien vuelve mañana cuenta dos veces.
        «Una sola vista» no significa que no le interesara.
        Las visitas se guardan 90 días y luego se borran solas.
      </p>
    </Stack>
  )
}

// Un día suelto no dice nada sin saber cómo es un día normal: con solo las
// barras, cualquier hora punta parece un hallazgo. De ahí la línea punteada
// con la media del periodo.
function ModalHoras({ dia, media, onClose }: {
  dia: Dia | null
  media: number[]
  onClose: () => void
}) {
  const c = useColoresGrafico()
  if (!dia) return null
  const datos = dia.horas.map((v, h) => ({ hora: `${String(h).padStart(2, '0')}h`, vistas: v, media: media[h] ?? 0 }))
  const punta = dia.horas.indexOf(Math.max(...dia.horas))

  return (
    <Modal
      open
      onOpenChange={o => { if (!o) onClose() }}
      size="lg"
      title={<span className="block first-letter:uppercase">{formatDate(dia.dia, "EEEE d 'de' MMMM")}</span>}
      description={`${dia.vistas} vistas · ${dia.sesiones} sesiones · hora punta a las ${String(punta).padStart(2, '0')}:00`}
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.linea} />
          <XAxis dataKey="hora" tickLine={false} axisLine={false} minTickGap={16} tick={{ fontSize: 11, fill: c.apoyo }} />
          <YAxis tickLine={false} axisLine={false} width={28} tick={{ fontSize: 11, fill: c.apoyo }} />
          <Tooltip contentStyle={estiloTooltip(c)} />
          <Bar dataKey="vistas" fill={c.serie} radius={[3, 3, 0, 0]} name="Vistas" />
          <Line type="monotone" dataKey="media" stroke={c.apoyo} strokeDasharray="4 3" dot={false} strokeWidth={1.5} name="Media del periodo" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        La línea punteada es la media por hora de todo el periodo, para poder
        juzgar si este día fue normal.
      </p>
    </Modal>
  )
}
