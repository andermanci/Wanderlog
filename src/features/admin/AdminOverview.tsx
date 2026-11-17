import { Users, Map, BarChart3, Activity, ScrollText, type LucideIcon } from 'lucide-react'
import { Page, Row, RowList, Section, Stack } from '@/design'
import { useAdminMetrics } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/formatBytes'
import { STATUS_LABELS } from '@/lib/utils'
import { Dato, Datos, TablaSkeleton } from './piezas'

const ATAJOS: { to: string; icon: LucideIcon; titulo: string; texto: string }[] = [
  { to: '/admin/usuarios', icon: Users, titulo: 'Usuarios', texto: 'Quién está registrado y qué puede hacer.' },
  { to: '/admin/viajes', icon: Map, titulo: 'Viajes', texto: 'Todos los viajes y cuánto ocupan.' },
  { to: '/admin/visitas', icon: BarChart3, titulo: 'Visitas', texto: 'Cuánta gente entra y qué mira.' },
  { to: '/admin/eventos', icon: Activity, titulo: 'Eventos', texto: 'Qué se usa, incluido lo que cuesta dinero.' },
  { to: '/admin/auditoria', icon: ScrollText, titulo: 'Auditoría', texto: 'Todo lo que se hace desde aquí.' },
]

export function AdminOverviewPage() {
  const { data: m, isLoading } = useAdminMetrics(30)

  const almacenamiento = Object.values(m?.almacenamiento ?? {}).reduce((s, n) => s + n, 0)

  return (
    <Page
      title="Resumen"
      subtitle="Las cifras de la plataforma. Los «nuevos» son de los últimos 30 días."
      width="wide"
    >
      <Stack>
        {isLoading || !m ? (
          <TablaSkeleton filas={2} />
        ) : (
          <>
            <div className="space-y-3">
              <Datos>
                <Dato valor={m.usuarios} etiqueta="Personas registradas"
                  sub={`${m.usuarios_nuevos} nuevas · ${m.usuarios_con_viaje} con algún viaje`} />
                <Dato valor={m.viajes} etiqueta="Viajes" sub={`${m.viajes_nuevos} nuevos`} />
                <Dato valor={m.actividades} etiqueta="Actividades" sub={`${m.gastos} gastos apuntados`} />
                <Dato valor={formatBytes(almacenamiento)} etiqueta="Almacenamiento"
                  sub={`${m.fotos} fotos · ${m.documentos} documentos`} />
              </Datos>
              <Datos>
                <Dato valor={m.audioguias} etiqueta="Audioguías generadas" sub="cada una cuesta dinero" />
                <Dato valor={m.colaboraciones} etiqueta="Viajes compartidos"
                  sub={`${m.invitaciones_pendientes} sin aceptar`} />
                {Object.entries(m.viajes_por_estado).slice(0, 2).map(([estado, n]) => (
                  <Dato key={estado} valor={n} etiqueta={STATUS_LABELS[estado] ?? estado} />
                ))}
              </Datos>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {m.top_destinos.length > 0 && (
                <Section title="Adónde va la gente">
                  <RowList>
                    {m.top_destinos.map(d => (
                      <Row key={d.destino} title={d.destino}
                        trailing={<span className="tabular-nums">{d.n} viaje{d.n === 1 ? '' : 's'}</span>} />
                    ))}
                  </RowList>
                </Section>
              )}

              <Section title="Almacenamiento por sitio">
                <RowList>
                  {Object.entries(m.almacenamiento)
                    .sort((a, b) => b[1] - a[1])
                    .map(([bucket, bytes]) => (
                      <Row key={bucket} title={bucket}
                        trailing={<span className="tabular-nums">{formatBytes(bytes)}</span>} />
                    ))}
                </RowList>
              </Section>
            </div>
          </>
        )}

        <Section title="Secciones del panel">
          <RowList>
            {ATAJOS.map(({ to, icon, titulo, texto }) => (
              <Row key={to} to={to} icon={icon} title={titulo} subtitle={texto} chevron />
            ))}
          </RowList>
        </Section>
      </Stack>
    </Page>
  )
}
