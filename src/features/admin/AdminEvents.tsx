import { useId, useState } from 'react'
import { Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Badge, Card, Empty, Page, Row, RowList, Section, Segmented, Stack } from '@/design'
import { useAdminEvents } from '@/lib/queries/admin'
import { formatDate } from '@/lib/utils'
import { Dato, Datos, TablaSkeleton } from './piezas'
import { estiloTooltip, useColoresGrafico } from './colores'

const VENTANAS = ['7', '30', '90'].map(d => ({ value: d, label: `${d} días` }))

// Nombres legibles. Un mapa explícito, no un formateo automático del
// identificador: esto se lee para decidir cosas, y «ai.audioguide_tts» obliga a
// traducir mentalmente cada vez.
const NOMBRES: Record<string, string> = {
  'trip.created': 'Crearon un viaje',
  'activity.created': 'Añadieron una actividad',
  'expense.added': 'Apuntaron un gasto',
  'document.uploaded': 'Subieron un documento',
  'collaborator.invited': 'Invitaron a alguien',
  'invite.accepted': 'Aceptaron una invitación',
  'trip.offline_downloaded': 'Descargaron un viaje',
  'trip.offline_deleted': 'Borraron la copia sin conexión',
  'ics.imported': 'Importaron un .ics',
  'pwa.installed': 'Instalaron la aplicación',
  'push.subscribed': 'Activaron los avisos',
  'audioguide.played': 'Escucharon una audioguía',
  'audioguide.map_opened': 'Abrieron el mapa de una audioguía',
  'ai.audioguide_tts': 'Generaron audio (Google TTS)',
  'ai.import': 'Importaron un sitio (Gemini)',
}

const esIA = (e: string) => e.startsWith('ai.')

export function AdminEventsPage() {
  const [dias, setDias] = useState(30)
  const { data, isLoading } = useAdminEvents(dias)
  const c = useColoresGrafico()
  const gradiente = useId()

  return (
    <Page
      title="Eventos"
      subtitle="Qué se usa de verdad. Los marcados «de pago» usan IA y cuestan dinero."
      actions={
        <Segmented label="Periodo" size="sm" value={String(dias)} onChange={v => setDias(Number(v))} options={VENTANAS} />
      }
      width="wide"
    >
      {isLoading || !data ? (
        <TablaSkeleton filas={3} />
      ) : !data.total ? (
        <Empty
          icon={Activity}
          title="Sin eventos todavía"
          description="Se registran solos a medida que se use la aplicación. Prueba con un periodo más largo. Si llevas días con tráfico y esto sigue vacío, revisa que la migración 052 esté aplicada."
        />
      ) : (
        <Stack>
          <Datos columnas={3}>
            <Dato valor={data.total} etiqueta="Acciones registradas" />
            <Dato valor={data.personas} etiqueta="Personas distintas" />
            <Dato
              valor={data.porEvento.filter(e => esIA(e.evento)).reduce((s, e) => s + e.n, 0)}
              etiqueta="Usos de IA"
              sub="cada uno se factura"
            />
          </Datos>

          {data.porDia.length > 1 && (
            <Section title="Por día">
              <Card>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={data.porDia} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.serie} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={c.serie} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dia" tickLine={false} axisLine={false} minTickGap={24}
                      tick={{ fontSize: 11, fill: c.apoyo }}
                      tickFormatter={(d: string) => formatDate(d, 'd MMM')} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={estiloTooltip(c)}
                      labelFormatter={(d: unknown) => formatDate(String(d), "EEEE d 'de' MMMM")}
                      formatter={(v: unknown) => [Number(v), 'acciones']}
                    />
                    <Area type="monotone" dataKey="n" stroke={c.serie} strokeWidth={2} fill={`url(#${gradiente})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </Section>
          )}

          {data.gastoIA.length > 0 && (
            <Section title="Quién gasta la cuota de IA">
              <RowList>
                {data.gastoIA.map(u => (
                  <Row
                    key={u.user_id}
                    to={`/admin/usuarios/${u.user_id}`}
                    title={u.email ?? 'cuenta borrada'}
                    trailing={<span className="tabular-nums">{u.usos} usos · {u.unidades.toLocaleString('es-ES')} unidades</span>}
                    chevron
                  />
                ))}
              </RowList>
              <p className="text-xs text-muted-foreground">
                «Unidades» son caracteres sintetizados en las audioguías (que es como
                factura Google) y llamadas en el resto. Desde la ficha de cada persona
                puedes quitarle las funciones con IA.
              </p>
            </Section>
          )}

          <Section title="Qué se hace">
            <RowList>
              {data.porEvento.map(e => (
                <Row
                  key={e.evento}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="truncate">{NOMBRES[e.evento] ?? e.evento}</span>
                      {esIA(e.evento) && <Badge tone="warning">de pago</Badge>}
                    </span>
                  }
                  trailing={<span className="tabular-nums">{e.n} · {e.personas} persona{e.personas === 1 ? '' : 's'}</span>}
                />
              ))}
            </RowList>
          </Section>

          <p className="text-xs text-muted-foreground">
            Lo que se corresponde con una fila de la base lo registra un disparador y
            no se puede falsear. Lo que no deja huella —descargar un viaje, instalar la
            aplicación— lo manda el navegador, así que alguien podría inflar sus propios
            contadores; los de coste van todos por el servidor. Nunca se guardan importes
            ni el contenido de nada. Se conservan un año.
          </p>
        </Stack>
      )}
    </Page>
  )
}
